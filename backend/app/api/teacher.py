import io
import os
import csv
import uuid
import asyncio
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, BackgroundTasks, Request
from sqlalchemy import select, func, and_, or_, desc, delete, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db, AsyncSessionLocal
from app.models.user import User
from app.models.course_material import CourseMaterial
from app.models.question import Question
from app.models.assessment import Assessment, AssessmentQuestion, AssessmentBan
from app.models.attempt import Attempt, AttemptAnswer
from app.models.serving import AttemptQuestionServing
from app.models.proctoring import Violation
from app.models.ai_job import AIGenerationJob
from app.schemas.question import QuestionOut, QuestionUpdate, GenerateMultipleRequest, QuestionsBatchRequest
from app.schemas.assessment import AssessmentCreate, AssessmentUpdate, AssessmentOut, AssessmentPublishRequest
from app.schemas.proctoring import BanOut
from app.schemas.analytics import AssessmentAnalyticsOut, ScoreDistributionBucket
from app.api.deps import require_teacher, require_teacher_or_admin
from app.storage.local import get_storage_provider
from app.services.pdf_service import extract_text_from_pdf, PDFProcessingError
from app.services.audit_service import record_audit_event
from app.services.adaptive_engine import select_next_adaptive_question
from app.api.websockets import ws_manager
from app.ai.generator import run_question_generation_pipeline
from app.ai.validator import validate_mcq
from app.ai.cleaner import clean_question_text

router = APIRouter(prefix="/teacher", tags=["Teacher Module"], dependencies=[Depends(require_teacher)])


async def has_active_attempts_for_question(session: AsyncSession, question_id: uuid.UUID) -> bool:
    """Checks if any assessment containing this question currently has active attempts."""
    stmt = (
        select(Attempt.id)
        .join(AssessmentQuestion, AssessmentQuestion.assessment_id == Attempt.assessment_id)
        .where(
            AssessmentQuestion.question_id == question_id,
            Attempt.status.in_(["in_progress", "disconnected"])
        )
        .limit(1)
    )
    return (await session.execute(stmt)).scalar_one_or_none() is not None


async def has_active_attempts_for_assessment(session: AsyncSession, assessment_id: uuid.UUID) -> bool:
    """Checks if an assessment currently has active attempts."""
    stmt = select(Attempt.id).where(
        Attempt.assessment_id == assessment_id,
        Attempt.status.in_(["in_progress", "disconnected"])
    ).limit(1)
    return (await session.execute(stmt)).scalar_one_or_none() is not None


# Background worker for multi-material AI question generation
async def generate_multiple_materials_background(
    job_id: uuid.UUID,
    material_jobs: List[Tuple[uuid.UUID, int, str]]
):
    async with AsyncSessionLocal() as session:
        job = await session.get(AIGenerationJob, job_id)
        if not job:
            return
        job.status = "processing"
        await session.commit()

    total_generated = 0
    failures = []

    for mat_id, count, text_content in material_jobs:
        try:
            # Run AI generation BEFORE touching the DB so no lock is held during generation
            mcqs, valid_count, err = await run_question_generation_pipeline(text_content, count)

            if mcqs:
                # Open a fresh short-lived session only for DB writes
                async with AsyncSessionLocal() as write_session:
                    # Remove prior unassigned questions for this material
                    await write_session.execute(
                        delete(Question).where(
                            Question.material_id == mat_id,
                            ~Question.id.in_(select(AssessmentQuestion.question_id))
                        )
                    )
                    await write_session.commit()

                    # Insert questions in small batches to avoid long lock windows
                    batch: List[Question] = []
                    for mcq in mcqs:
                        q = Question(
                            id=uuid.uuid4(),
                            material_id=mat_id,
                            job_id=job_id,
                            text=clean_question_text(mcq.text),
                            options=mcq.options,
                            correct_option_index=mcq.correct_option_index,
                            difficulty=mcq.difficulty,
                            source_chunk_ref=mcq.source_chunk_ref,
                            is_duplicate_flag=mcq.is_duplicate_flag
                        )
                        batch.append(q)
                        if len(batch) >= 5:
                            for bq in batch:
                                write_session.add(bq)
                            await write_session.commit()
                            batch = []
                            await asyncio.sleep(0)  # Yield to let other coroutines run

                    # Flush any remaining questions
                    if batch:
                        for bq in batch:
                            write_session.add(bq)
                        await write_session.commit()

                total_generated += len(mcqs)
            elif err:
                failures.append(err)
        except Exception as e:
            failures.append(str(e))

        # Yield between materials
        await asyncio.sleep(0)

    # Final status update in its own short session
    async with AsyncSessionLocal() as status_session:
        job = await status_session.get(AIGenerationJob, job_id)
        if job:
            if total_generated > 0:
                job.status = "completed"
                job.valid_count = total_generated
                job.failure_reason = "; ".join(failures) if failures else None
            else:
                job.status = "failed"
                job.failure_reason = "; ".join(failures) if failures else "Generation produced 0 valid questions."
            await status_session.commit()


# Background worker for AI question generation
async def generate_questions_background(job_id: uuid.UUID, material_id: uuid.UUID, requested_count: int, text_content: str):
    # Mark job as processing in its own short transaction
    async with AsyncSessionLocal() as session:
        job = await session.get(AIGenerationJob, job_id)
        if not job:
            return
        job.status = "processing"
        await session.commit()

    try:
        # Run AI generation OUTSIDE the DB session so no lock is held during long AI calls
        mcqs, valid_count, err = await run_question_generation_pipeline(text_content, requested_count)

        if not mcqs or valid_count == 0:
            async with AsyncSessionLocal() as session:
                job = await session.get(AIGenerationJob, job_id)
                if job:
                    job.status = "failed"
                    job.failure_reason = err or "Generation produced 0 valid questions."
                    await session.commit()
            return

        # Delete prior unassigned questions in a short transaction
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(Question).where(
                    Question.material_id == material_id,
                    ~Question.id.in_(select(AssessmentQuestion.question_id))
                )
            )
            await session.commit()

        # Insert questions in small batches of 5 to keep write transactions short
        batch: List[Question] = []
        for mcq in mcqs:
            q = Question(
                id=uuid.uuid4(),
                material_id=material_id,
                job_id=job_id,
                text=clean_question_text(mcq.text),
                options=mcq.options,
                correct_option_index=mcq.correct_option_index,
                difficulty=mcq.difficulty,
                source_chunk_ref=mcq.source_chunk_ref,
                is_duplicate_flag=mcq.is_duplicate_flag
            )
            batch.append(q)
            if len(batch) >= 5:
                async with AsyncSessionLocal() as session:
                    for bq in batch:
                        session.add(bq)
                    await session.commit()
                batch = []
                await asyncio.sleep(0)  # Yield to event loop between batches

        if batch:
            async with AsyncSessionLocal() as session:
                for bq in batch:
                    session.add(bq)
                await session.commit()

        # Mark job completed
        async with AsyncSessionLocal() as session:
            job = await session.get(AIGenerationJob, job_id)
            if job:
                job.status = "completed"
                job.valid_count = len(mcqs)
                job.failure_reason = None
                await session.commit()

    except Exception as e:
        async with AsyncSessionLocal() as session:
            job = await session.get(AIGenerationJob, job_id)
            if job:
                job.status = "failed"
                job.failure_reason = str(e)
                await session.commit()


@router.post("/materials/upload")
async def upload_course_material(
    request: Request,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    form = await request.form()
    upload_list = []

    # Collect from 'files', 'file', or any form file field
    for key in ["files", "file"]:
        for item in form.getlist(key):
            if hasattr(item, "filename") and item.filename:
                upload_list.append(item)

    if not upload_list:
        for key, value in form.multi_items():
            if hasattr(value, "filename") and value.filename and value not in upload_list:
                upload_list.append(value)

    if not upload_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No PDF files uploaded.")

    storage = get_storage_provider()
    created_materials = []

    for f in upload_list:
        if not f.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File '{f.filename}' is not a PDF.")

        content = await f.read()
        try:
            extracted_text = extract_text_from_pdf(content)
        except PDFProcessingError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error in '{f.filename}': {str(e)}")

        # Check for existing material with identical filename for this teacher
        existing_mat = await db.scalar(
            select(CourseMaterial).where(
                CourseMaterial.teacher_id == current_teacher.id,
                CourseMaterial.filename == f.filename
            )
        )

        if existing_mat:
            storage_path = await storage.save_file(content, f"material_{existing_mat.id.hex}_{f.filename}")
            try:
                if existing_mat.storage_path and existing_mat.storage_path != storage_path:
                    await storage.delete_file(existing_mat.storage_path)
            except Exception:
                pass
            existing_mat.storage_path = storage_path
            existing_mat.uploaded_at = datetime.now(timezone.utc)
            # Commit each file individually to avoid holding the write lock across slow I/O
            await db.commit()
            created_materials.append({
                "id": str(existing_mat.id),
                "filename": existing_mat.filename,
                "character_count": len(extracted_text),
                "uploaded_at": existing_mat.uploaded_at.isoformat()
            })
        else:
            storage_path = await storage.save_file(content, f"material_{uuid.uuid4().hex}_{f.filename}")
            material = CourseMaterial(
                id=uuid.uuid4(),
                teacher_id=current_teacher.id,
                filename=f.filename,
                storage_path=storage_path,
                uploaded_at=datetime.now(timezone.utc)
            )
            db.add(material)
            # Commit each file individually to avoid holding the write lock across slow I/O
            await db.commit()
            created_materials.append({
                "id": str(material.id),
                "filename": material.filename,
                "character_count": len(extracted_text),
                "uploaded_at": material.uploaded_at.isoformat()
            })

    if len(created_materials) == 1:
        return {
            **created_materials[0],
            "materials": created_materials
        }
    return {
        "materials": created_materials,
        "count": len(created_materials)
    }


@router.post("/materials/upload-multiple")
async def upload_multiple_course_materials(
    request: Request,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    form = await request.form()
    upload_list = []

    for key in ["files", "file"]:
        for item in form.getlist(key):
            if hasattr(item, "filename") and item.filename:
                upload_list.append(item)

    if not upload_list:
        for key, value in form.multi_items():
            if hasattr(value, "filename") and value.filename and value not in upload_list:
                upload_list.append(value)

    if not upload_list:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No PDF files provided.")

    storage = get_storage_provider()
    created_materials = []

    for f in upload_list:
        if not f.filename.lower().endswith(".pdf"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"File '{f.filename}' is not a PDF.")

        content = await f.read()
        try:
            extracted_text = extract_text_from_pdf(content)
        except PDFProcessingError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Error in '{f.filename}': {str(e)}")

        existing_mat = await db.scalar(
            select(CourseMaterial).where(
                CourseMaterial.teacher_id == current_teacher.id,
                CourseMaterial.filename == f.filename
            )
        )

        if existing_mat:
            storage_path = await storage.save_file(content, f"material_{existing_mat.id.hex}_{f.filename}")
            try:
                if existing_mat.storage_path and existing_mat.storage_path != storage_path:
                    await storage.delete_file(existing_mat.storage_path)
            except Exception:
                pass
            existing_mat.storage_path = storage_path
            existing_mat.uploaded_at = datetime.now(timezone.utc)
            await db.commit()  # Per-file commit — releases write lock quickly
            created_materials.append({
                "id": str(existing_mat.id),
                "filename": existing_mat.filename,
                "character_count": len(extracted_text),
                "uploaded_at": existing_mat.uploaded_at.isoformat()
            })
        else:
            storage_path = await storage.save_file(content, f"material_{uuid.uuid4().hex}_{f.filename}")
            material = CourseMaterial(
                id=uuid.uuid4(),
                teacher_id=current_teacher.id,
                filename=f.filename,
                storage_path=storage_path,
                uploaded_at=datetime.now(timezone.utc)
            )
            db.add(material)
            await db.commit()  # Per-file commit — releases write lock quickly
            created_materials.append({
                "id": str(material.id),
                "filename": material.filename,
                "character_count": len(extracted_text),
                "uploaded_at": material.uploaded_at.isoformat()
            })

    return created_materials


@router.get("/materials")
async def list_course_materials(
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    stmt = (
        select(CourseMaterial)
        .where(CourseMaterial.teacher_id == current_teacher.id)
        .order_by(desc(CourseMaterial.uploaded_at))
    )
    materials = (await db.scalars(stmt)).all()

    seen_filenames = set()
    deduped = []
    orphan_ids = []

    for m in materials:
        # Check if the file physically exists in storage
        file_exists = False
        if m.storage_path:
            if os.path.exists(m.storage_path):
                file_exists = True
            else:
                upload_rel = os.path.join(settings.UPLOAD_DIR, os.path.basename(m.storage_path))
                if os.path.exists(upload_rel):
                    file_exists = True
                    m.storage_path = upload_rel

        if not file_exists:
            orphan_ids.append(m.id)
            continue

        fn_key = m.filename.strip().lower()
        if fn_key not in seen_filenames:
            seen_filenames.add(fn_key)
            deduped.append({
                "id": str(m.id),
                "filename": m.filename,
                "uploaded_at": m.uploaded_at.isoformat()
            })
        else:
            orphan_ids.append(m.id)

    # Automatically purge deleted/orphan file records from database so page refresh is always clean
    if orphan_ids:
        try:
            q_stmt = select(Question.id).where(Question.material_id.in_(orphan_ids))
            q_ids = (await db.scalars(q_stmt)).all()
            if q_ids:
                await db.execute(delete(AttemptQuestionServing).where(AttemptQuestionServing.question_id.in_(q_ids)))
                await db.execute(delete(AttemptAnswer).where(AttemptAnswer.question_id.in_(q_ids)))
                await db.execute(update(Attempt).where(Attempt.current_question_id.in_(q_ids)).values(current_question_id=None))
                await db.execute(delete(AssessmentQuestion).where(AssessmentQuestion.question_id.in_(q_ids)))
                await db.execute(delete(Question).where(Question.id.in_(q_ids)))
            await db.execute(delete(AIGenerationJob).where(AIGenerationJob.material_id.in_(orphan_ids)))
            await db.execute(delete(CourseMaterial).where(CourseMaterial.id.in_(orphan_ids)))
            await db.commit()
        except Exception:
            await db.rollback()

    return deduped


@router.delete("/materials")
async def delete_all_course_materials(
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(CourseMaterial).where(CourseMaterial.teacher_id == current_teacher.id)
    materials = (await db.scalars(stmt)).all()
    if not materials:
        return {"message": "No materials to delete", "deleted_count": 0}

    mat_ids = [m.id for m in materials]

    # Delete all associated questions, jobs, and serving links
    q_stmt = select(Question.id).where(Question.material_id.in_(mat_ids))
    q_ids = (await db.scalars(q_stmt)).all()

    if q_ids:
        await db.execute(delete(AttemptQuestionServing).where(AttemptQuestionServing.question_id.in_(q_ids)))
        await db.execute(delete(AttemptAnswer).where(AttemptAnswer.question_id.in_(q_ids)))
        await db.execute(update(Attempt).where(Attempt.current_question_id.in_(q_ids)).values(current_question_id=None))
        await db.execute(delete(AssessmentQuestion).where(AssessmentQuestion.question_id.in_(q_ids)))
        await db.execute(delete(Question).where(Question.id.in_(q_ids)))

    await db.execute(delete(AIGenerationJob).where(AIGenerationJob.material_id.in_(mat_ids)))

    storage = get_storage_provider()
    for m in materials:
        try:
            if m.storage_path:
                await storage.delete_file(m.storage_path)
        except Exception:
            pass
        await db.delete(m)

    await db.commit()
    return {"message": "All course materials deleted successfully", "deleted_count": len(materials)}


@router.delete("/materials/{material_id}")
async def delete_course_material(
    material_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    material = await db.get(CourseMaterial, material_id)
    if not material:
        # Idempotent delete: if already removed from database, return success
        return {"message": "Course material already deleted or not found", "id": str(material_id)}

    # Find ALL material records for this teacher matching the filename (case-insensitive) OR this ID
    all_matching_mats = (await db.scalars(
        select(CourseMaterial).where(
            CourseMaterial.teacher_id == current_teacher.id,
            or_(
                CourseMaterial.id == material_id,
                func.lower(CourseMaterial.filename) == material.filename.strip().lower()
            )
        )
    )).all()
    if not all_matching_mats:
        all_matching_mats = [material]

    mat_ids = [m.id for m in all_matching_mats]

    # 1. Fetch all question IDs for these material IDs
    q_stmt = select(Question.id).where(Question.material_id.in_(mat_ids))
    q_ids = (await db.scalars(q_stmt)).all()

    if q_ids:
        # 2. Delete AttemptQuestionServing forensic references
        await db.execute(delete(AttemptQuestionServing).where(AttemptQuestionServing.question_id.in_(q_ids)))
        # 3. Delete AttemptAnswer references
        await db.execute(delete(AttemptAnswer).where(AttemptAnswer.question_id.in_(q_ids)))
        # 4. Nullify attempt current_question_id if pointing to any of these
        await db.execute(
            update(Attempt)
            .where(Attempt.current_question_id.in_(q_ids))
            .values(current_question_id=None)
        )
        # 5. Delete AssessmentQuestion links
        await db.execute(delete(AssessmentQuestion).where(AssessmentQuestion.question_id.in_(q_ids)))
        # 6. Delete the questions themselves
        await db.execute(delete(Question).where(Question.id.in_(q_ids)))

    # 7. Delete all AI Generation Jobs for these materials
    await db.execute(delete(AIGenerationJob).where(AIGenerationJob.material_id.in_(mat_ids)))

    # 8. Delete physical files from storage provider
    storage = get_storage_provider()
    for m in all_matching_mats:
        try:
            if m.storage_path:
                await storage.delete_file(m.storage_path)
        except Exception:
            pass

    # 9. Delete the course material records
    for m in all_matching_mats:
        await db.delete(m)
    await db.commit()
    return {"message": "Course material deleted successfully", "id": str(material_id)}


@router.post("/materials/{material_id}/generate")
async def trigger_question_generation(
    material_id: uuid.UUID,
    count: int = 15,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    material = await db.get(CourseMaterial, material_id)
    if not material or material.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Course material not found.")

    storage = get_storage_provider()
    try:
        content = await storage.get_file(material.storage_path)
        text = extract_text_from_pdf(content)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to read material: {str(e)}")

    job = AIGenerationJob(
        id=uuid.uuid4(),
        material_id=material.id,
        requested_count=count,
        valid_count=0,
        status="queued",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(job)
    await db.commit()

    background_tasks.add_task(generate_questions_background, job.id, material.id, count, text)

    return {
        "job_id": str(job.id),
        "status": job.status,
        "requested_count": job.requested_count
    }


@router.post("/materials/generate-multiple")
async def trigger_multiple_question_generation(
    data: GenerateMultipleRequest,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    if not data.material_ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No materials specified.")

    stmt = select(CourseMaterial).where(
        CourseMaterial.id.in_(data.material_ids),
        CourseMaterial.teacher_id == current_teacher.id
    )
    materials = (await db.scalars(stmt)).all()
    if len(materials) != len(data.material_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more course materials not found.")

    storage = get_storage_provider()
    material_jobs: List[Tuple[uuid.UUID, int, str]] = []

    num_mats = len(materials)
    base_count = data.count // num_mats
    remainder = data.count % num_mats

    for idx, mat in enumerate(materials):
        alloc_count = base_count + (1 if idx < remainder else 0)
        if alloc_count <= 0:
            alloc_count = 1
        try:
            content = await storage.get_file(mat.storage_path)
            text = extract_text_from_pdf(content)
            material_jobs.append((mat.id, alloc_count, text))
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to read material '{mat.filename}': {str(e)}")

    # Main tracker job linked to primary material
    job = AIGenerationJob(
        id=uuid.uuid4(),
        material_id=materials[0].id,
        requested_count=data.count,
        valid_count=0,
        status="queued",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    db.add(job)
    await db.commit()

    background_tasks.add_task(generate_multiple_materials_background, job.id, material_jobs)

    return {
        "job_id": str(job.id),
        "material_ids": [str(m.id) for m in materials],
        "status": job.status,
        "requested_count": job.requested_count
    }


@router.get("/jobs/{job_id}")
async def get_generation_job_status(
    job_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    job = await db.get(AIGenerationJob, job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found.")
    return {
        "job_id": str(job.id),
        "material_id": str(job.material_id),
        "status": job.status,
        "requested_count": job.requested_count,
        "valid_count": job.valid_count,
        "failure_reason": job.failure_reason,
        "created_at": job.created_at.isoformat(),
        "updated_at": job.updated_at.isoformat()
    }


@router.get("/materials/{material_id}/questions", response_model=List[QuestionOut])
async def list_questions_for_material(
    material_id: uuid.UUID,
    include_retired: bool = False,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    material = await db.get(CourseMaterial, material_id)
    if not material or material.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Material not found.")

    stmt = select(Question).where(Question.material_id == material_id)
    if not include_retired:
        stmt = stmt.where(Question.retired_at.is_(None))
    questions = (await db.scalars(stmt)).all()
    results = []
    for q in questions:
        q_out = QuestionOut.model_validate(q)
        q_out.text = clean_question_text(q_out.text)
        results.append(q_out)
    return results


@router.post("/materials/questions-batch", response_model=List[QuestionOut])
async def list_questions_for_multiple_materials(
    data: QuestionsBatchRequest,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    if not data.material_ids:
        return []

    stmt = select(Question).join(CourseMaterial, CourseMaterial.id == Question.material_id).where(
        Question.material_id.in_(data.material_ids),
        CourseMaterial.teacher_id == current_teacher.id
    )
    if data.job_id:
        stmt = stmt.where(Question.job_id == data.job_id)
    if not data.include_retired:
        stmt = stmt.where(Question.retired_at.is_(None))
    questions = (await db.scalars(stmt)).all()
    results = []
    for q in questions:
        q_out = QuestionOut.model_validate(q)
        q_out.text = clean_question_text(q_out.text)
        results.append(q_out)
    return results


@router.put("/questions/{question_id}", response_model=QuestionOut)
async def edit_question(
    question_id: uuid.UUID,
    payload: QuestionUpdate,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    # LOCK CHECK: Block edit if any active attempt is in progress
    if await has_active_attempts_for_question(db, question.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment pool locked: Cannot edit question while student attempts are currently in progress."
        )

    # Apply updates
    if payload.text is not None:
        question.text = payload.text
    if payload.options is not None:
        question.options = payload.options
    if payload.correct_option_index is not None:
        question.correct_option_index = payload.correct_option_index
    if payload.difficulty is not None:
        question.difficulty = payload.difficulty

    # Revalidation
    from app.ai.providers.base import MCQ
    mock_mcq = MCQ(
        text=question.text,
        options=question.options,
        correct_option_index=question.correct_option_index,
        difficulty=question.difficulty,
        source_chunk_ref=question.source_chunk_ref
    )
    is_valid, err = validate_mcq(mock_mcq)
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Question edit failed re-validation: {err}")

    await db.commit()
    await record_audit_event(
        session=db,
        actor_user_id=current_teacher.id,
        action="question_edited",
        target_type="question",
        target_id=question.id
    )
    await db.commit()
    return QuestionOut.model_validate(question)


@router.delete("/questions/{question_id}")
async def retire_question(
    question_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Soft-delete/retire question. Questions with history are NEVER hard-deleted.
    Blocked if an assessment containing this question has an attempt in progress.
    """
    question = await db.get(Question, question_id)
    if not question:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found.")

    if await has_active_attempts_for_question(db, question.id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment pool locked: Cannot retire question while student attempts are currently in progress."
        )

    question.retired_at = datetime.now(timezone.utc)
    await db.commit()

    await record_audit_event(
        session=db,
        actor_user_id=current_teacher.id,
        action="question_retired",
        target_type="question",
        target_id=question.id
    )
    await db.commit()
    return {"message": "Question successfully retired (soft-deleted).", "retired_at": question.retired_at.isoformat()}


@router.post("/assessments", response_model=AssessmentOut)
async def create_assessment(
    data: AssessmentCreate,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = Assessment(
        id=uuid.uuid4(),
        teacher_id=current_teacher.id,
        title=data.title,
        time_limit_seconds=data.time_limit_seconds,
        per_question_time_limit_seconds=data.per_question_time_limit_seconds,
        fast_response_threshold_seconds=data.fast_response_threshold_seconds,
        enable_speed_adaptive=data.enable_speed_adaptive,
        max_question_count=data.max_question_count,
        promotion_threshold=data.promotion_threshold,
        demotion_threshold=data.demotion_threshold,
        max_violations=data.max_violations,
        scoring_weights=data.scoring_weights,
        promotion_rules=data.promotion_rules,
        ban_on_violation_breach=data.ban_on_violation_breach,
        device_switch_as_violation=data.device_switch_as_violation,
        status="draft",
        created_at=datetime.now(timezone.utc),
        config_locked=False
    )
    db.add(assessment)
    await db.flush()

    # Assign question pool if provided
    if data.question_ids:
        for q_id in set(data.question_ids):
            q = await db.get(Question, q_id)
            if q and q.retired_at is None:
                aq = AssessmentQuestion(
                    assessment_id=assessment.id,
                    question_id=q.id,
                    difficulty=q.difficulty  # Snapshot difficulty
                )
                db.add(aq)

    await db.commit()
    await record_audit_event(
        session=db,
        actor_user_id=current_teacher.id,
        action="assessment_created",
        target_type="assessment",
        target_id=assessment.id
    )
    await db.commit()
    out = AssessmentOut.model_validate(assessment)
    out.question_count = len(data.question_ids) if data.question_ids else 0
    return out


@router.get("/assessments", response_model=List[AssessmentOut])
async def list_teacher_assessments(
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(Assessment).where(Assessment.teacher_id == current_teacher.id).order_by(desc(Assessment.created_at))
    assessments = (await db.scalars(stmt)).all()
    results = []
    for a in assessments:
        q_count = await db.scalar(
            select(func.count(AssessmentQuestion.question_id)).where(AssessmentQuestion.assessment_id == a.id)
        )
        total_attempts = await db.scalar(
            select(func.count(Attempt.id)).where(Attempt.assessment_id == a.id)
        ) or 0
        active_attempts = await db.scalar(
            select(func.count(Attempt.id)).where(
                Attempt.assessment_id == a.id,
                Attempt.status.in_(["in_progress", "disconnected"])
            )
        ) or 0
        completed_attempts = await db.scalar(
            select(func.count(Attempt.id)).where(
                Attempt.assessment_id == a.id,
                Attempt.status.in_(["submitted", "terminated"])
            )
        ) or 0

        out = AssessmentOut.model_validate(a)
        out.question_count = q_count or 0
        out.config_locked = active_attempts > 0
        out.attempts_count = total_attempts
        out.active_attempts_count = active_attempts
        out.completed_attempts_count = completed_attempts
        results.append(out)
    return results


@router.get("/assessments/{assessment_id}", response_model=AssessmentOut)
async def get_teacher_assessment(
    assessment_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    q_count = await db.scalar(
        select(func.count(AssessmentQuestion.question_id)).where(AssessmentQuestion.assessment_id == assessment.id)
    )
    total_attempts = await db.scalar(
        select(func.count(Attempt.id)).where(Attempt.assessment_id == assessment.id)
    ) or 0
    active_attempts = await db.scalar(
        select(func.count(Attempt.id)).where(
            Attempt.assessment_id == assessment.id,
            Attempt.status.in_(["in_progress", "disconnected"])
        )
    ) or 0
    completed_attempts = await db.scalar(
        select(func.count(Attempt.id)).where(
            Attempt.assessment_id == assessment.id,
            Attempt.status.in_(["submitted", "terminated"])
        )
    ) or 0

    out = AssessmentOut.model_validate(assessment)
    out.question_count = q_count or 0
    out.config_locked = active_attempts > 0
    out.attempts_count = total_attempts
    out.active_attempts_count = active_attempts
    out.completed_attempts_count = completed_attempts
    return out


@router.put("/assessments/{assessment_id}", response_model=AssessmentOut)
async def update_assessment(
    assessment_id: uuid.UUID,
    data: AssessmentUpdate,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    has_active = await has_active_attempts_for_assessment(db, assessment.id)
    if has_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assessment configuration locked: Cannot modify while student attempts are currently in progress."
        )

    for field, val in data.model_dump(exclude_unset=True).items():
        if field != "question_ids" and hasattr(assessment, field) and val is not None:
            setattr(assessment, field, val)

    if data.question_ids is not None:
        # Replace question pool
        delete_stmt = AssessmentQuestion.__table__.delete().where(AssessmentQuestion.assessment_id == assessment.id)
        await db.execute(delete_stmt)
        for q_id in set(data.question_ids):
            q = await db.get(Question, q_id)
            if q and q.retired_at is None:
                db.add(AssessmentQuestion(
                    assessment_id=assessment.id,
                    question_id=q.id,
                    difficulty=q.difficulty
                ))

    assessment.config_locked = False
    await db.commit()
    q_count = await db.scalar(
        select(func.count(AssessmentQuestion.question_id)).where(AssessmentQuestion.assessment_id == assessment.id)
    )
    total_attempts = await db.scalar(
        select(func.count(Attempt.id)).where(Attempt.assessment_id == assessment.id)
    ) or 0
    active_attempts = await db.scalar(
        select(func.count(Attempt.id)).where(
            Attempt.assessment_id == assessment.id,
            Attempt.status.in_(["in_progress", "disconnected"])
        )
    ) or 0
    completed_attempts = await db.scalar(
        select(func.count(Attempt.id)).where(
            Attempt.assessment_id == assessment.id,
            Attempt.status.in_(["submitted", "terminated"])
        )
    ) or 0

    out = AssessmentOut.model_validate(assessment)
    out.question_count = q_count or 0
    out.config_locked = False
    out.attempts_count = total_attempts
    out.active_attempts_count = active_attempts
    out.completed_attempts_count = completed_attempts
    return out


@router.post("/assessments/{assessment_id}/publish")
async def publish_assessment(
    assessment_id: uuid.UUID,
    publish_req: Optional[AssessmentPublishRequest] = None,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    if assessment.status == "published":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assessment is already published.")

    # Pool Sufficiency Invariant Checks
    counts = await db.execute(
        select(AssessmentQuestion.difficulty, func.count(AssessmentQuestion.question_id))
        .join(Question, Question.id == AssessmentQuestion.question_id)
        .where(
            AssessmentQuestion.assessment_id == assessment.id,
            Question.retired_at == None
        )
        .group_by(AssessmentQuestion.difficulty)
    )
    diff_counts = {row[0]: row[1] for row in counts.all()}
    warnings = []

    # Verify minimum pool depth across difficulties
    for diff in ["easy", "medium", "hard"]:
        count = diff_counts.get(diff, 0)
        if count < 3:
            warnings.append(f"Insufficient active questions for difficulty '{diff}': found {count}, recommended >= 3.")

    total_eligible = sum(diff_counts.values())
    if total_eligible < assessment.max_question_count and not (publish_req and publish_req.override_sufficiency):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": f"Question pool ({total_eligible}) is smaller than max_question_count ({assessment.max_question_count}). Set override_sufficiency=true to publish anyway.",
                "warnings": warnings,
                "total_eligible": total_eligible,
                "max_question_count": assessment.max_question_count
            }
        )

    assessment.status = "published"
    await db.commit()

    await record_audit_event(
        session=db,
        actor_user_id=current_teacher.id,
        action="assessment_published",
        target_type="assessment",
        target_id=assessment.id,
        metadata={"total_questions": total_eligible, "warnings": warnings}
    )
    await db.commit()

    return {
        "message": "Assessment published successfully.",
        "status": assessment.status,
        "total_eligible_questions": total_eligible,
        "warnings": warnings
    }


@router.delete("/assessments/{assessment_id}")
async def delete_assessment(
    assessment_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    """
    Deletes an assessment (Current / Future / Past) created by the current teacher,
    cleaning up all associated questions, attempts, answers, proctoring violations,
    and bans.
    """
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    # Get all attempt IDs for this assessment
    attempt_ids = (await db.scalars(
        select(Attempt.id).where(Attempt.assessment_id == assessment.id)
    )).all()

    if attempt_ids:
        await db.execute(delete(AttemptQuestionServing).where(AttemptQuestionServing.attempt_id.in_(attempt_ids)))
        await db.execute(delete(AttemptAnswer).where(AttemptAnswer.attempt_id.in_(attempt_ids)))
        await db.execute(delete(Violation).where(Violation.attempt_id.in_(attempt_ids)))
        await db.execute(delete(Attempt).where(Attempt.id.in_(attempt_ids)))

    await db.execute(delete(AssessmentBan).where(AssessmentBan.assessment_id == assessment.id))
    await db.execute(delete(AssessmentQuestion).where(AssessmentQuestion.assessment_id == assessment.id))

    assessment_title = assessment.title
    assessment_status = assessment.status
    attempts_deleted_count = len(attempt_ids)

    await db.delete(assessment)
    await db.commit()

    await record_audit_event(
        session=db,
        actor_user_id=current_teacher.id,
        action="assessment_deleted",
        target_type="assessment",
        target_id=assessment_id,
        metadata={
            "title": assessment_title,
            "status": assessment_status,
            "deleted_attempts_count": attempts_deleted_count,
            "deleted_by_role": "teacher"
        }
    )
    await db.commit()

    return {
        "message": f"Assessment '{assessment_title}' and all associated {attempts_deleted_count} attempt records deleted successfully.",
        "deleted_assessment_id": str(assessment_id)
    }


@router.get("/assessments/{assessment_id}/attempts")
async def review_assessment_attempts(
    assessment_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    stmt = (
        select(Attempt, User.name, User.email)
        .join(User, User.id == Attempt.student_id)
        .where(Attempt.assessment_id == assessment.id)
        .order_by(desc(Attempt.started_at))
    )
    rows = (await db.execute(stmt)).all()

    items = []
    for attempt, student_name, student_email in rows:
        v_count = await db.scalar(
            select(func.count(Violation.id)).where(Violation.attempt_id == attempt.id)
        )
        ban = await db.scalar(
            select(AssessmentBan).where(
                AssessmentBan.assessment_id == assessment.id,
                AssessmentBan.student_id == attempt.student_id,
                AssessmentBan.revoked_at.is_(None)
            )
        )
        items.append({
            "attempt_id": str(attempt.id),
            "student_id": str(attempt.student_id),
            "student_name": student_name,
            "student_email": student_email,
            "status": attempt.status,
            "completion_reason": attempt.completion_reason,
            "started_at": attempt.started_at.isoformat(),
            "submitted_at": attempt.submitted_at.isoformat() if attempt.submitted_at else None,
            "final_score": attempt.final_score,
            "highest_difficulty": attempt.highest_difficulty_reached,
            "violation_count": v_count or 0,
            "has_active_ban": ban is not None
        })
    return items


@router.get("/assessments/{assessment_id}/analytics", response_model=AssessmentAnalyticsOut)
async def get_assessment_analytics(
    assessment_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    stmt = select(Attempt).where(Attempt.assessment_id == assessment.id)
    attempts = (await db.scalars(stmt)).all()

    total_attempts = len(attempts)
    completed = [a for a in attempts if a.status == "submitted"]
    terminated = [a for a in attempts if a.status == "terminated"]

    scores = [a.final_score for a in completed + terminated]
    avg_score = sum(scores) / len(scores) if scores else 0.0
    high_score = max(scores) if scores else 0.0
    low_score = min(scores) if scores else 0.0

    # Violations total
    attempt_ids = [a.id for a in attempts]
    total_violations = 0
    if attempt_ids:
        total_violations = await db.scalar(
            select(func.count(Violation.id)).where(Violation.attempt_id.in_(attempt_ids))
        ) or 0

    # Accuracy by difficulty
    diff_accuracy: Dict[str, float] = {}
    for diff in ["easy", "medium", "hard"]:
        total_ans = await db.scalar(
            select(func.count(AttemptAnswer.id))
            .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
            .where(Attempt.assessment_id == assessment.id, AttemptAnswer.difficulty_at_time == diff)
        ) or 0
        correct_ans = await db.scalar(
            select(func.count(AttemptAnswer.id))
            .join(Attempt, Attempt.id == AttemptAnswer.attempt_id)
            .where(
                Attempt.assessment_id == assessment.id,
                AttemptAnswer.difficulty_at_time == diff,
                AttemptAnswer.is_correct.is_(True)
            )
        ) or 0
        diff_accuracy[diff] = round((correct_ans / total_ans * 100.0), 1) if total_ans > 0 else 0.0

    # Score distribution buckets (0-20%, 21-40%, 41-60%, 61-80%, 81-100%)
    buckets = [
        ScoreDistributionBucket(range_label="0-20%", count=0),
        ScoreDistributionBucket(range_label="21-40%", count=0),
        ScoreDistributionBucket(range_label="41-60%", count=0),
        ScoreDistributionBucket(range_label="61-80%", count=0),
        ScoreDistributionBucket(range_label="81-100%", count=0),
    ]
    max_possible = assessment.max_question_count * 3.0  # approximate scale
    if max_possible > 0:
        for s in scores:
            pct = (s / max_possible) * 100.0
            if pct <= 20:
                buckets[0].count += 1
            elif pct <= 40:
                buckets[1].count += 1
            elif pct <= 60:
                buckets[2].count += 1
            elif pct <= 80:
                buckets[3].count += 1
            else:
                buckets[4].count += 1

    return AssessmentAnalyticsOut(
        assessment_id=assessment.id,
        assessment_title=assessment.title,
        total_attempts=total_attempts,
        completed_attempts=len(completed),
        terminated_attempts=len(terminated),
        average_score=round(avg_score, 2),
        highest_score=high_score,
        lowest_score=low_score,
        average_difficulty_reached="medium",
        accuracy_by_difficulty=diff_accuracy,
        score_distribution=buckets,
        total_violations_recorded=total_violations
    )


@router.get("/assessments/{assessment_id}/export")
async def export_attempts_csv(
    assessment_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher_or_admin),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or (current_teacher.role != "admin" and assessment.teacher_id != current_teacher.id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    stmt = (
        select(Attempt, User.name, User.email)
        .join(User, User.id == Attempt.student_id)
        .where(Attempt.assessment_id == assessment.id)
    )
    rows = (await db.execute(stmt)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "Attempt ID", "Student Name", "Student Email", "Status", "Completion Reason",
        "Final Score", "Highest Difficulty", "Started At", "Submitted At"
    ])
    for attempt, student_name, student_email in rows:
        writer.writerow([
            str(attempt.id),
            student_name,
            student_email,
            attempt.status,
            attempt.completion_reason or "",
            attempt.final_score,
            attempt.highest_difficulty_reached,
            attempt.started_at.isoformat(),
            attempt.submitted_at.isoformat() if attempt.submitted_at else ""
        ])

    from fastapi.responses import Response
    return Response(
        content=output.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=assessment_{assessment.id}_attempts.csv"}
    )


@router.post("/assessments/{assessment_id}/bans/{student_id}", response_model=BanOut)
async def apply_assessment_ban(
    assessment_id: uuid.UUID,
    student_id: uuid.UUID,
    reason: str = "Manual instructor ban applied.",
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    student = await db.get(User, student_id)
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found.")

    now = datetime.now(timezone.utc)
    ban_reason = reason or "Manual instructor ban applied."

    existing_ban = await db.scalar(
        select(AssessmentBan).where(
            AssessmentBan.assessment_id == assessment.id,
            AssessmentBan.student_id == student_id,
            AssessmentBan.revoked_at.is_(None)
        )
    )
    if not existing_ban:
        existing_ban = AssessmentBan(
            id=uuid.uuid4(),
            assessment_id=assessment.id,
            student_id=student.id,
            banned_at=now,
            banned_by=current_teacher.id,
            ban_source="manual_teacher",
            reason=ban_reason
        )
        db.add(existing_ban)
    else:
        existing_ban.reason = ban_reason

    # Terminate any active attempt for this student on this assessment
    stmt = (
        select(Attempt)
        .where(
            Attempt.assessment_id == assessment.id,
            Attempt.student_id == student.id,
            Attempt.status.in_(["in_progress", "disconnected"])
        )
    )
    active_attempts = (await db.scalars(stmt)).all()
    for att in active_attempts:
        att.status = "terminated"
        att.completion_reason = "manual_teacher_ban"
        att.submitted_at = now

    await db.commit()

    # Broadcast real-time termination signal so student's screen locks immediately
    await ws_manager.broadcast_violation_signal(
        assessment_id=str(assessment.id),
        violation_payload={
            "attempt_id": str(active_attempts[0].id) if active_attempts else "",
            "student_id": str(student.id),
            "student_name": student.name,
            "type": "instructor_ban",
            "occurred_at": now.isoformat(),
            "violation_count": 999,
            "max_violations": assessment.max_violations,
            "is_terminated": True,
            "message": f"Assessment terminated: {ban_reason}"
        }
    )

    await record_audit_event(
        session=db,
        actor_user_id=current_teacher.id,
        action="assessment_ban_applied",
        target_type="assessment_ban",
        target_id=existing_ban.id,
        metadata={"student_id": str(student.id), "assessment_id": str(assessment.id), "reason": ban_reason}
    )
    await db.commit()

    out = BanOut.model_validate(existing_ban)
    out.student_name = student.name
    return out


@router.delete("/assessments/{assessment_id}/bans/{student_id}")
async def revoke_assessment_ban(
    assessment_id: uuid.UUID,
    student_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    now = datetime.now(timezone.utc)

    # 1. Revoke active assessment bans
    bans = (await db.scalars(
        select(AssessmentBan).where(
            AssessmentBan.assessment_id == assessment_id,
            AssessmentBan.student_id == student_id,
            AssessmentBan.revoked_at.is_(None)
        )
    )).all()
    for b in bans:
        b.revoked_at = now
        b.revoked_by = current_teacher.id

    # 2. Reinstate latest attempt so student can continue writing their exam
    stmt = (
        select(Attempt)
        .where(
            Attempt.assessment_id == assessment_id,
            Attempt.student_id == student_id
        )
        .order_by(desc(Attempt.started_at))
        .limit(1)
    )
    latest_attempt = (await db.execute(stmt)).scalar_one_or_none()

    if latest_attempt and latest_attempt.status == "terminated":
        latest_attempt.status = "in_progress"
        latest_attempt.completion_reason = None
        latest_attempt.submitted_at = None
        latest_attempt.last_heartbeat_at = now

        # If exam time elapsed while banned/terminated, refresh started_at so student has time to complete
        if latest_attempt.started_at:
            started = latest_attempt.started_at
            if started.tzinfo is None:
                started = started.replace(tzinfo=timezone.utc)
            if (now - started).total_seconds() >= assessment.time_limit_seconds:
                latest_attempt.started_at = now

        # Reset terminal violations so student gets fresh strikes
        await db.execute(
            delete(Violation).where(
                Violation.attempt_id == latest_attempt.id
            )
        )

        # Ensure a valid current question is active
        if not latest_attempt.current_question_id:
            # Check for existing unanswered serving first
            stmt_unanswered = (
                select(AttemptQuestionServing)
                .where(
                    AttemptQuestionServing.attempt_id == latest_attempt.id,
                    AttemptQuestionServing.question_id.not_in(
                        select(AttemptAnswer.question_id).where(AttemptAnswer.attempt_id == latest_attempt.id)
                    )
                )
                .order_by(AttemptQuestionServing.sequence_number.desc())
                .limit(1)
            )
            unanswered_serving = (await db.execute(stmt_unanswered)).scalar_one_or_none()
            if unanswered_serving:
                latest_attempt.current_question_id = unanswered_serving.question_id
                latest_attempt.current_question_started_at = now
            else:
                next_q = await select_next_adaptive_question(
                    session=db,
                    attempt=latest_attempt,
                    assessment=assessment,
                    target_difficulty="easy"
                )
                if next_q:
                    answers_count = await db.scalar(
                        select(func.count(AttemptAnswer.id)).where(AttemptAnswer.attempt_id == latest_attempt.id)
                    ) or 0
                    serving = AttemptQuestionServing(
                        id=uuid.uuid4(),
                        attempt_id=latest_attempt.id,
                        question_id=next_q.id,
                        served_at=now,
                        sequence_number=answers_count + 1
                    )
                    db.add(serving)
                    latest_attempt.current_question_id = next_q.id
                    latest_attempt.current_question_started_at = now

    await db.commit()

    # 3. Broadcast unban / reinstatement event to student and live proctoring hub
    await ws_manager.broadcast_violation_signal(
        assessment_id=str(assessment_id),
        violation_payload={
            "attempt_id": str(latest_attempt.id) if latest_attempt else "",
            "student_id": str(student_id),
            "type": "ban_revoked",
            "is_reinstated": True,
            "is_terminated": False,
            "message": "Instructor has revoked the ban. You can now continue your exam."
        }
    )

    await record_audit_event(
        session=db,
        actor_user_id=current_teacher.id,
        action="assessment_ban_revoked",
        target_type="assessment_ban",
        target_id=student_id,
        metadata={"student_id": str(student_id), "assessment_id": str(assessment_id)}
    )
    await db.commit()

    return {
        "message": "Assessment ban successfully revoked. Exam attempt has been resumed.",
        "attempt_id": str(latest_attempt.id) if latest_attempt else None,
        "status": "in_progress"
    }


@router.post("/assessments/{assessment_id}/attempts/{attempt_id}/reinstate")
async def reinstate_assessment_attempt(
    assessment_id: uuid.UUID,
    attempt_id: uuid.UUID,
    current_teacher: User = Depends(require_teacher),
    db: AsyncSession = Depends(get_db)
):
    assessment = await db.get(Assessment, assessment_id)
    if not assessment or assessment.teacher_id != current_teacher.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assessment not found.")

    attempt = await db.get(Attempt, attempt_id)
    if not attempt or attempt.assessment_id != assessment.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Attempt not found.")

    now = datetime.now(timezone.utc)

    # 1. Revoke any active bans for this student
    bans = (await db.scalars(
        select(AssessmentBan).where(
            AssessmentBan.assessment_id == assessment.id,
            AssessmentBan.student_id == attempt.student_id,
            AssessmentBan.revoked_at.is_(None)
        )
    )).all()
    for b in bans:
        b.revoked_at = now
        b.revoked_by = current_teacher.id

    # 2. Reset attempt status to in_progress
    attempt.status = "in_progress"
    attempt.completion_reason = None
    attempt.submitted_at = None
    attempt.last_heartbeat_at = now

    # If exam time elapsed while banned/terminated, refresh started_at so student has time to complete
    if attempt.started_at:
        started = attempt.started_at
        if started.tzinfo is None:
            started = started.replace(tzinfo=timezone.utc)
        if (now - started).total_seconds() >= assessment.time_limit_seconds:
            attempt.started_at = now

    # Reset violations for this attempt
    await db.execute(
        delete(Violation).where(
            Violation.attempt_id == attempt.id
        )
    )

    # 3. Ensure a valid active question is assigned
    if not attempt.current_question_id:
        stmt_unanswered = (
            select(AttemptQuestionServing)
            .where(
                AttemptQuestionServing.attempt_id == attempt.id,
                AttemptQuestionServing.question_id.not_in(
                    select(AttemptAnswer.question_id).where(AttemptAnswer.attempt_id == attempt.id)
                )
            )
            .order_by(AttemptQuestionServing.sequence_number.desc())
            .limit(1)
        )
        unanswered_serving = (await db.execute(stmt_unanswered)).scalar_one_or_none()
        if unanswered_serving:
            attempt.current_question_id = unanswered_serving.question_id
            attempt.current_question_started_at = now
        else:
            next_q = await select_next_adaptive_question(
                session=db,
                attempt=attempt,
                assessment=assessment,
                target_difficulty="easy"
            )
            if next_q:
                answers_count = await db.scalar(
                    select(func.count(AttemptAnswer.id)).where(AttemptAnswer.attempt_id == attempt.id)
                ) or 0
                serving = AttemptQuestionServing(
                    id=uuid.uuid4(),
                    attempt_id=attempt.id,
                    question_id=next_q.id,
                    served_at=now,
                    sequence_number=answers_count + 1
                )
                db.add(serving)
                attempt.current_question_id = next_q.id
                attempt.current_question_started_at = now

    await db.commit()

    # 4. Broadcast real-time reinstatement event
    await ws_manager.broadcast_violation_signal(
        assessment_id=str(assessment.id),
        violation_payload={
            "attempt_id": str(attempt.id),
            "student_id": str(attempt.student_id),
            "type": "attempt_reinstated",
            "is_reinstated": True,
            "is_terminated": False,
            "message": "Instructor has reinstated your attempt. You can now continue your exam."
        }
    )

    await record_audit_event(
        session=db,
        actor_user_id=current_teacher.id,
        action="attempt_reinstated",
        target_type="attempt",
        target_id=attempt.id,
        metadata={"student_id": str(attempt.student_id), "assessment_id": str(assessment.id)}
    )
    await db.commit()

    return {
        "message": "Attempt successfully reinstated. The student can now continue their exam.",
        "attempt_id": str(attempt.id),
        "status": "in_progress"
    }
