import uuid
import pytest
from httpx import AsyncClient
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.core.security import create_access_token
from app.services.pdf_topic_service import detect_pdf_topic


def create_sample_pdf_bytes(text: str) -> bytes:
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


def test_detect_pdf_topic_unit():
    # Python detection
    py_text = """
    Python Programming Fundamentals:
    def calculate_metrics(data):
        return [x * 2 for x in data]
    class StudentManager:
        def __init__(self, name):
            self.name = name
    Using pandas and numpy for data science.
    """
    py_result = detect_pdf_topic(py_text, "python_course.pdf")
    assert py_result["subject"] == "Python Programming"
    assert py_result["category"] == "Programming Languages"
    assert py_result["is_matched"] is True
    assert len(py_result["topics"]) > 0

    # Java detection
    java_text = """
    Core Java OOP Principles:
    public class Application {
        public static void main(String[] args) {
            System.out.println("Starting Java JVM application");
        }
    }
    class Animal extends Organism implements Breathable {
        private String species;
    }
    """
    java_result = detect_pdf_topic(java_text, "java_module1.pdf")
    assert java_result["subject"] == "Java Programming"
    assert java_result["category"] == "Programming Languages"
    assert java_result["is_matched"] is True

    # Operating Systems detection
    os_text = """
    Operating Systems and Memory Management:
    Virtual memory with paging and page replacement algorithms including LRU and FIFO.
    Process synchronization using semaphores, mutex, and resolving deadlocks with Banker's algorithm.
    """
    os_result = detect_pdf_topic(os_text, "os_notes.pdf")
    assert os_result["subject"] == "Operating Systems"
    assert os_result["category"] == "Core Computer Science"

    # Data Structures & Algorithms with C implementation code
    dsa_text = """
    DATA STRUCTURES Regulation: R24
    UNIT 2 -LINKED LISTS
    A linked list is a linear data structure where elements are not stored at contiguous memory locations.
    struct node {
        int data;
        struct node *next;
    };
    struct node *newnode = (struct node*)malloc(sizeof(struct node));
    printf("Memory allocated");
    free(newnode);
    Double Linked List and Circular Linked List operations: insertion, deletion, traversal.
    """
    dsa_result = detect_pdf_topic(dsa_text, "R24_Unit_2.pdf")
    assert dsa_result["subject"] == "Data Structures & Algorithms"
    assert dsa_result["category"] == "Core Computer Science"
    assert dsa_result["is_matched"] is True
    assert "Linked Lists" in dsa_result["topics"]
    assert "Data Structures & Algorithms - Linked Lists Assessment" in dsa_result["suggested_title"]


@pytest.mark.asyncio
async def test_pdf_topic_upload_endpoint(client: AsyncClient, db_session: AsyncSession):
    now = datetime.now(timezone.utc)
    teacher = User(
        id=uuid.uuid4(),
        name="Topic Test Teacher",
        email=f"teacher_{uuid.uuid4().hex[:6]}@school.com",
        password_hash="hash",
        role="teacher",
        created_at=now
    )
    db_session.add(teacher)
    await db_session.commit()

    token = create_access_token(data={"sub": str(teacher.id), "role": "teacher", "type": "access"})
    headers = {"Authorization": f"Bearer {token}"}

    # Upload Python PDF
    py_pdf = create_sample_pdf_bytes("Python functions with def, lambda, and pandas data structures.")
    files_payload = [
        ("file", ("python_guide.pdf", py_pdf, "application/pdf"))
    ]
    resp = await client.post("/api/teacher/materials/upload", files=files_payload, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["detected_subject"] == "Python Programming"
    assert data["detected_category"] == "Programming Languages"
    assert "topics" in data["detected_topics"] or isinstance(data["detected_topics"], list)
    assert data["confidence_score"] > 0.5
    mat_id = data["id"]

    # Verify listing includes topic data
    list_resp = await client.get("/api/teacher/materials", headers=headers)
    assert list_resp.status_code == 200
    mats = list_resp.json()
    matched = next((m for m in mats if m["id"] == mat_id), None)
    assert matched is not None
    assert matched["detected_subject"] == "Python Programming"

    # Test analyze endpoint
    analyze_resp = await client.post(f"/api/teacher/materials/{mat_id}/analyze", headers=headers)
    assert analyze_resp.status_code == 200
    analyze_data = analyze_resp.json()
    assert analyze_data["detected_subject"] == "Python Programming"
