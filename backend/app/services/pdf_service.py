import io
import re
from pypdf import PdfReader
from app.config import settings


class PDFProcessingError(Exception):
    pass


def clean_extracted_pdf_text(text: str) -> str:
    """Removes non-printable characters, fixes broken hyphenations, and normalizes spacing."""
    if not text:
        return ""
    # Remove private use area / unprintable unicode glyphs
    t = re.sub(r"[\uf000-\uffff\x00-\x08\x0b\x0c\x0e-\x1f]", " ", text)
    # Fix hyphenated words broken across lines: 'algo -\n rithm' -> 'algorithm', 'look-\naside' -> 'look-aside'
    t = re.sub(r"(\b[a-zA-Z]+)-\s*\n\s*([a-zA-Z]+\b)", r"\1\2", t)
    t = re.sub(r"(\w+)\s+-\s+(\w+)", r"\1-\2", t)
    # Normalize multiple whitespace characters per line while preserving line breaks
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in t.replace("\r", "\n").split("\n")]
    # Remove empty lines excess (max 2 consecutive newlines)
    cleaned_text = "\n".join(lines)
    cleaned_text = re.sub(r"\n{3,}", "\n\n", cleaned_text)
    return cleaned_text.strip()


def extract_text_from_pdf(pdf_bytes: bytes, max_size_bytes: int = settings.MAX_UPLOAD_SIZE_BYTES) -> str:
    """
    Extracts text from PDF bytes page by page.
    Validates PDF format, checks size, and rejects empty or corrupt files.
    """
    if not pdf_bytes:
        raise PDFProcessingError("Uploaded file is empty.")

    if len(pdf_bytes) > max_size_bytes:
        raise PDFProcessingError(f"PDF file size ({len(pdf_bytes)} bytes) exceeds the maximum allowed {max_size_bytes} bytes (20MB).")

    # Content sniffing: PDF magic header %PDF
    if not pdf_bytes.startswith(b"%PDF"):
        raise PDFProcessingError("Invalid file type: File does not have a valid PDF header.")

    try:
        reader = PdfReader(io.BytesIO(pdf_bytes))
        if len(reader.pages) == 0:
            raise PDFProcessingError("PDF contains no pages.")

        extracted_pages = []
        for page_num, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            cleaned_page = clean_extracted_pdf_text(page_text)
            if cleaned_page:
                extracted_pages.append(f"--- Page {page_num + 1} ---\n{cleaned_page}")

        full_text = "\n\n".join(extracted_pages).strip()
        if not full_text:
            raise PDFProcessingError(
                "PDF contains no extractable text. Scanned/image-only PDFs are not supported in v1 (OCR limitation)."
            )

        return full_text

    except PDFProcessingError:
        raise
    except Exception as e:
        raise PDFProcessingError(f"Failed to parse PDF document: Corrupted or unreadable format ({str(e)})")
