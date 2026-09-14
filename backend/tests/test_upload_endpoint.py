import io
import uuid
import pytest
from httpx import AsyncClient
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.core.security import create_access_token


def create_sample_pdf_bytes(text: str = "Operating Systems Concept: Virtual memory uses paging.") -> bytes:
    content_stream = f"BT /F1 12 Tf 72 712 Td ({text}) Tj ET".encode("latin1")
    pdf_template = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
        b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n"
        b"4 0 obj\n<< /Length " + str(len(content_stream)).encode() + b" >>\nstream\n" + content_stream + b"\nendstream\nendobj\n"
        b"5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n"
        b"xref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000244 00000 n \n0000000340 00000 n \n"
        b"trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n418\n%%EOF"
    )
    return pdf_template


@pytest.mark.asyncio
async def test_teacher_materials_upload_single_and_multiple(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(id=uuid.uuid4(), name="Teacher 1", email=f"teacher_{uuid.uuid4().hex[:6]}@school.com", password_hash="hash", role="teacher", created_at=now)
    db_session.add(teacher)
    await db_session.commit()

    token = create_access_token(data={"sub": str(teacher.id), "role": "teacher", "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}

    pdf_bytes = create_sample_pdf_bytes("Virtual memory and paging mechanisms in Operating Systems.")

    # 1. Test upload with field name 'files' (multiple)
    files_payload = [
        ("files", ("test1.pdf", pdf_bytes, "application/pdf")),
        ("files", ("test2.pdf", pdf_bytes, "application/pdf"))
    ]
    resp = await client.post("/api/teacher/materials/upload", files=files_payload, headers=headers)
    assert resp.status_code == 200, f"Error: {resp.text}"
    data = resp.json()
    assert "materials" in data
    assert len(data["materials"]) == 2

    # 2. Test upload with field name 'file' (single)
    file_payload = [
        ("file", ("single.pdf", pdf_bytes, "application/pdf"))
    ]
    resp2 = await client.post("/api/teacher/materials/upload", files=file_payload, headers=headers)
    assert resp2.status_code == 200, f"Error: {resp2.text}"
    data2 = resp2.json()
    assert data2["filename"] == "single.pdf"
    mat_id = data2["id"]

    # 3. Test material deletion
    del_resp = await client.delete(f"/api/teacher/materials/{mat_id}", headers=headers)
    assert del_resp.status_code == 200, f"Error: {del_resp.text}"
    assert del_resp.json()["id"] == mat_id

    # 4. Verify it's gone from library
    list_resp = await client.get("/api/teacher/materials", headers=headers)
    assert list_resp.status_code == 200
    library_mat_ids = [m["id"] for m in list_resp.json()]
    assert mat_id not in library_mat_ids
