from typing import Optional, Tuple
from app.ai.providers.base import MCQ

VALID_DIFFICULTIES = {"easy", "medium", "hard"}


def validate_mcq(mcq: MCQ) -> Tuple[bool, Optional[str]]:
    """
    Validates that an MCQ satisfies all structural requirements:
    - Non-empty question text
    - Exactly 4 options, all non-empty strings
    - No duplicate options
    - Correct option index within range [0, 3]
    - Valid difficulty tag ('easy', 'medium', 'hard')
    - Has valid source_chunk_ref
    """
    if not mcq.text or not mcq.text.strip():
        return False, "Question text is empty."

    if not isinstance(mcq.options, (list, tuple)) or len(mcq.options) != 4:
        return False, f"Question must have exactly 4 options, found {len(mcq.options) if isinstance(mcq.options, list) else 0}."

    cleaned_options = [opt.strip() for opt in mcq.options if isinstance(opt, str) and opt.strip()]
    if len(cleaned_options) != 4:
        return False, "All 4 options must be non-empty strings."

    # Check for duplicate options (case-insensitive)
    lower_options = [opt.lower() for opt in cleaned_options]
    if len(set(lower_options)) != 4:
        return False, "Options contains duplicate choices."

    if not isinstance(mcq.correct_option_index, int) or mcq.correct_option_index not in (0, 1, 2, 3):
        return False, f"Correct option index must be an integer between 0 and 3, got {mcq.correct_option_index}."

    if not mcq.difficulty or mcq.difficulty.lower() not in VALID_DIFFICULTIES:
        return False, f"Difficulty must be one of {VALID_DIFFICULTIES}, got '{mcq.difficulty}'."

    if not mcq.source_chunk_ref or not mcq.source_chunk_ref.strip():
        return False, "Source chunk reference (grounding) is missing."

    return True, None
