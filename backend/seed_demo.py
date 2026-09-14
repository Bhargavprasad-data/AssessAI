"""
Demo Data Seeder for Smart Proctoring System
WARNING: Demo credentials are strictly for development/demonstration testing.
DO NOT use these credentials in a production environment.
"""

import sys
import os
import asyncio
import uuid
from datetime import datetime, timezone, timedelta

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy import select
from app.database import AsyncSessionLocal
from app.models.user import User
from app.models.course_material import CourseMaterial
from app.models.question import Question
from app.models.assessment import Assessment, AssessmentQuestion, AssessmentBan
from app.models.attempt import Attempt, AttemptAnswer
from app.models.serving import AttemptQuestionServing
from app.models.proctoring import Violation
from app.core.security import get_password_hash


async def seed_data():
    print("=" * 70)
    print("SEEDING DEMO DATA (AI-Based Adaptive Online Assessment & Smart Proctoring)")
    print("NOTICE: Demo credentials are for dev/testing only. FORBIDDEN in production.")
    print("=" * 70)

    async with AsyncSessionLocal() as session:
        # Check if already seeded
        existing_admin = await session.scalar(select(User).where(User.email == "admin@proctor.ai"))
        if existing_admin:
            print("Database already contains demo seed data. Skipping seeding.")
            return

        now = datetime.now(timezone.utc)

        # 1. Users
        primary_admin = User(
            id=uuid.uuid4(),
            name="Bhargav Admin",
            email="bhargavvana80@gmail.com",
            password_hash=get_password_hash("Bhargav11@prasad"),
            role="admin",
            created_at=now
        )
        session.add(primary_admin)

        admin_user = User(
            id=uuid.uuid4(),
            name="Dr. System Administrator",
            email="admin@proctor.ai",
            password_hash=get_password_hash("AdminDemo2026!"),
            role="admin",
            created_at=now
        )
        session.add(admin_user)

        teacher_user = User(
            id=uuid.uuid4(),
            name="Prof. Sarah Jenkins",
            email="teacher@proctor.ai",
            password_hash=get_password_hash("TeacherDemo2026!"),
            role="teacher",
            created_at=now
        )
        session.add(teacher_user)

        students = []
        for i in range(1, 6):
            student = User(
                id=uuid.uuid4(),
                name=f"Student {i} (Demo)",
                email=f"student{i}@proctor.ai",
                password_hash=get_password_hash("StudentDemo2026!"),
                role="student",
                created_at=now
            )
            students.append(student)
            session.add(student)

        await session.flush()
        print(f"Created 1 Admin, 1 Teacher, and {len(students)} Students.")

        # 2. Course Material
        material = CourseMaterial(
            id=uuid.uuid4(),
            teacher_id=teacher_user.id,
            filename="Machine_Learning_Fundamentals.pdf",
            storage_path="./uploads/ml_fundamentals.pdf",
            uploaded_at=now - timedelta(days=2)
        )
        session.add(material)
        await session.flush()

        # 3. Questions (Spanning Easy, Medium, Hard + 1 Retired)
        questions_data = [
            # Easy questions (Recall & definitions)
            {
                "text": "What is the primary objective of Supervised Learning?",
                "options": ["To map input features to known target labels", "To cluster unlabelled data without ground truth", "To maximize long-term reward via trial and error", "To compress input matrices into lower dimensions"],
                "correct": 0,
                "diff": "easy",
                "chunk": "Section 1: Supervised Learning Core"
            },
            {
                "text": "Which metric represents the ratio of true positives to all predicted positives?",
                "options": ["Precision", "Recall", "Accuracy", "Mean Squared Error"],
                "correct": 0,
                "diff": "easy",
                "chunk": "Section 2: Classification Metrics"
            },
            {
                "text": "What is an Overfitting model characterized by?",
                "options": ["High variance and low training error but high test error", "High bias and poor performance on training data", "Equally high error on both training and test sets", "Constant predictions independent of input"],
                "correct": 0,
                "diff": "easy",
                "chunk": "Section 3: Bias-Variance Tradeoff"
            },
            # Medium questions (Application & Comparison)
            {
                "text": "When comparing L1 (Lasso) and L2 (Ridge) regularization, which statement is true?",
                "options": ["L1 tends to produce sparse feature weights, effectively performing feature selection", "L2 sets feature weights strictly to zero", "Both penalize weights with absolute values", "L1 is preferred when all features contribute equally"],
                "correct": 0,
                "diff": "medium",
                "chunk": "Section 4: Regularization Techniques"
            },
            {
                "text": "In Gradient Descent optimization, what occurs if the learning rate is set excessively high?",
                "options": ["The parameter updates may diverge or oscillate across the objective valley", "Convergence speed is guaranteed to be optimal", "The gradient magnitude drops to zero instantly", "The model converts into an analytical closed-form solution"],
                "correct": 0,
                "diff": "medium",
                "chunk": "Section 5: Optimization & Convergence"
            },
            {
                "text": "How does Random Forest reduce model variance compared to a single Decision Tree?",
                "options": ["By bootstrap aggregating (bagging) de-correlated trees trained on random feature subsets", "By increasing tree depth indefinitely on the entire dataset", "By converting tree leaves into linear activation functions", "By applying boosting sequentially to previous errors"],
                "correct": 0,
                "diff": "medium",
                "chunk": "Section 6: Ensemble Methods"
            },
            # Hard questions (Multi-concept reasoning)
            {
                "text": "Under extreme class imbalance (1:1000), why is Cross-Entropy Loss often substituted with Focal Loss in dense prediction?",
                "options": ["Focal loss adds a modulating factor (1-pt)^gamma to down-weight easy examples and focus training on hard negatives", "Cross-entropy cannot be differentiated using standard automatic differentiation", "Focal loss completely ignores negative samples during backpropagation", "Cross-entropy requires class balance strictly equal to 1:1"],
                "correct": 0,
                "diff": "hard",
                "chunk": "Section 7: Advanced Loss Formulations"
            },
            {
                "text": "In Transformer self-attention, why is the scaled dot-product divided by the square root of the key dimension (sqrt(d_k))?",
                "options": ["To counteract dot-product growth for large dimensions that pushes softmax into regions with vanishing gradients", "To ensure the attention weights sum to 100", "To enforce matrix orthogonality between query and value projections", "To reduce computational complexity from quadratic to linear"],
                "correct": 0,
                "diff": "hard",
                "chunk": "Section 8: Attention Mechanisms"
            },
            {
                "text": "When deploying deep networks under strict inference latency constraints, how does Knowledge Distillation preserve multi-concept representation?",
                "options": ["A compact student network trains on soft probabilities from a complex teacher network, capturing dark knowledge", "The teacher network weights are directly pruned by 90% without retraining", "Inference is executed exclusively in 64-bit floating point precision", "Batch normalization layers are permanently removed"],
                "correct": 0,
                "diff": "hard",
                "chunk": "Section 9: Model Compression"
            },
            # Question to be SOFT-RETIRED (demonstrating soft-delete integrity)
            {
                "text": "[Deprecated Spec] What is the traditional Perceptron convergence theorem limitation?",
                "options": ["It cannot learn non-linearly separable functions like XOR without hidden layers", "It cannot learn linearly separable functions", "It requires continuous differentiable activation functions", "It can only handle binary input features"],
                "correct": 0,
                "diff": "medium",
                "chunk": "Section 10: Historical Neural Models",
                "is_retired": True
            }
        ]

        created_questions = []
        for q_data in questions_data:
            q = Question(
                id=uuid.uuid4(),
                material_id=material.id,
                text=q_data["text"],
                options=q_data["options"],
                correct_option_index=q_data["correct"],
                difficulty=q_data["diff"],
                source_chunk_ref=q_data["chunk"],
                is_duplicate_flag=False,
                retired_at=now - timedelta(hours=1) if q_data.get("is_retired") else None
            )
            session.add(q)
            created_questions.append(q)

        await session.flush()
        print(f"Created {len(created_questions)} MCQs (including 1 soft-retired question).")

        # 4. Published Assessment
        assessment = Assessment(
            id=uuid.uuid4(),
            teacher_id=teacher_user.id,
            title="Midterm Assessment: Machine Learning & Adaptive AI",
            time_limit_seconds=1800,  # 30 minutes
            per_question_time_limit_seconds=60,  # 1 min per question
            fast_response_threshold_seconds=25,
            enable_speed_adaptive=True,
            max_question_count=6,
            promotion_threshold=2,
            demotion_threshold=2,
            max_violations=3,
            scoring_weights={"easy": 1.0, "medium": 2.0, "hard": 3.0},
            promotion_rules={"promotion_threshold": 2, "demotion_threshold": 2},
            ban_on_violation_breach=True,
            device_switch_as_violation=False,
            status="published",
            created_at=now - timedelta(days=1),
            config_locked=True
        )
        session.add(assessment)
        await session.flush()

        # Add questions to AssessmentQuestion (snapshot difficulty)
        for q in created_questions:
            aq = AssessmentQuestion(
                assessment_id=assessment.id,
                question_id=q.id,
                difficulty=q.difficulty
            )
            session.add(aq)

        await session.flush()
        print(f"Created Published Assessment '{assessment.title}' with locked config.")

        # 5. Completed Attempt 1: High Performer (Student 1)
        st1 = students[0]
        attempt1 = Attempt(
            id=uuid.uuid4(),
            assessment_id=assessment.id,
            student_id=st1.id,
            started_at=now - timedelta(hours=3),
            last_heartbeat_at=now - timedelta(hours=2, minutes=45),
            submitted_at=now - timedelta(hours=2, minutes=45),
            final_score=13.0,
            highest_difficulty_reached="hard",
            status="submitted",
            completion_reason="max_questions_reached",
            consent_ack_at=now - timedelta(hours=3),
            active_device_id="desktop_chrome_mac",
            promotion_counter=0,
            demotion_counter=0,
            current_question_id=None,
            current_question_started_at=None
        )
        session.add(attempt1)
        await session.flush()

        # Seed serving records & answers for Attempt 1
        active_pool = [q for q in created_questions if q.retired_at is None]
        for seq, q in enumerate(active_pool[:6], start=1):
            serving = AttemptQuestionServing(
                id=uuid.uuid4(),
                attempt_id=attempt1.id,
                question_id=q.id,
                served_at=now - timedelta(hours=3, minutes=-(seq * 2)),
                sequence_number=seq
            )
            session.add(serving)

            answer = AttemptAnswer(
                id=uuid.uuid4(),
                attempt_id=attempt1.id,
                question_id=q.id,
                selected_option_index=0,  # All correct
                is_correct=True,
                response_time_ms=12000,  # Fast
                difficulty_at_time=q.difficulty,
                submitted_at=now - timedelta(hours=3, minutes=-(seq * 2 + 1))
            )
            session.add(answer)

        # 6. Completed Attempt 2: Medium Performer (Student 2) including the since-retired question
        # Demonstrates Section 8.13 soft-delete reporting integrity!
        st2 = students[1]
        attempt2 = Attempt(
            id=uuid.uuid4(),
            assessment_id=assessment.id,
            student_id=st2.id,
            started_at=now - timedelta(hours=2),
            last_heartbeat_at=now - timedelta(hours=1, minutes=40),
            submitted_at=now - timedelta(hours=1, minutes=40),
            final_score=7.0,
            highest_difficulty_reached="medium",
            status="submitted",
            completion_reason="max_questions_reached",
            consent_ack_at=now - timedelta(hours=2),
            active_device_id="laptop_windows_edge",
            promotion_counter=0,
            demotion_counter=0,
            current_question_id=None,
            current_question_started_at=None
        )
        session.add(attempt2)
        await session.flush()

        # Include the retired question in attempt2 answers to demonstrate historical integrity
        retired_q = [q for q in created_questions if q.retired_at is not None][0]
        st2_questions = active_pool[:5] + [retired_q]
        for seq, q in enumerate(st2_questions, start=1):
            serving = AttemptQuestionServing(
                id=uuid.uuid4(),
                attempt_id=attempt2.id,
                question_id=q.id,
                served_at=now - timedelta(hours=2, minutes=-(seq * 3)),
                sequence_number=seq
            )
            session.add(serving)

            is_corr = (seq % 2 != 0)
            ans = AttemptAnswer(
                id=uuid.uuid4(),
                attempt_id=attempt2.id,
                question_id=q.id,
                selected_option_index=0 if is_corr else 1,
                is_correct=is_corr,
                response_time_ms=28000,
                difficulty_at_time=q.difficulty,
                submitted_at=now - timedelta(hours=2, minutes=-(seq * 3 + 1))
            )
            session.add(ans)

        # 7. Terminated Attempt 3: Proctoring Breach & Ban (Student 3)
        st3 = students[2]
        attempt3 = Attempt(
            id=uuid.uuid4(),
            assessment_id=assessment.id,
            student_id=st3.id,
            started_at=now - timedelta(minutes=45),
            last_heartbeat_at=now - timedelta(minutes=35),
            submitted_at=now - timedelta(minutes=35),
            final_score=2.0,
            highest_difficulty_reached="easy",
            status="terminated",
            completion_reason="violation_threshold",
            consent_ack_at=now - timedelta(minutes=45),
            active_device_id="desktop_firefox",
            promotion_counter=0,
            demotion_counter=0,
            current_question_id=None,
            current_question_started_at=None
        )
        session.add(attempt3)
        await session.flush()

        # Add 3 violations triggering termination
        v_types = ["tab_switch", "window_blur", "copy"]
        for idx, v_type in enumerate(v_types, start=1):
            violation = Violation(
                id=uuid.uuid4(),
                attempt_id=attempt3.id,
                type=v_type,
                occurred_at=now - timedelta(minutes=40 - idx * 2),
                metadata_json={"strike": idx, "source": "browser_focus_event"}
            )
            session.add(violation)

        # Assessment ban row (automated system violation threshold)
        ban = AssessmentBan(
            id=uuid.uuid4(),
            assessment_id=assessment.id,
            student_id=st3.id,
            banned_at=now - timedelta(minutes=35),
            banned_by=None,
            ban_source="system_violation_threshold",
            reason="Automated: Exceeded violation threshold (3 violations)"
        )
        session.add(ban)

        await session.commit()
        print("Created Sample Completed Attempts, Violations, and Terminated Attempt with Ban.")
        print("=" * 70)
        print("DEMO CREDENTIALS FOR TESTING:")
        print("  Admin:   admin@proctor.ai   / AdminDemo2026!")
        print("  Teacher: teacher@proctor.ai / TeacherDemo2026!")
        print("  Student: student1@proctor.ai / StudentDemo2026!")
        print("  Student: student2@proctor.ai / StudentDemo2026!")
        print("  Student: student3@proctor.ai (Banned) / StudentDemo2026!")
        print("  Student: student4@proctor.ai / StudentDemo2026!")
        print("  Student: student5@proctor.ai / StudentDemo2026!")
        print("=" * 70)


if __name__ == "__main__":
    asyncio.run(seed_data())
