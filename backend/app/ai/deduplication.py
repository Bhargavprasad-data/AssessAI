import re
from typing import List, Set
from app.ai.providers.base import MCQ


def _tokenize(text: str) -> Set[str]:
    # Extract alpha-numeric tokens lowercased
    tokens = re.findall(r"\b[a-zA-Z0-9]{3,}\b", text.lower())
    return set(tokens)


def calculate_jaccard_similarity(text1: str, text2: str) -> float:
    set1 = _tokenize(text1)
    set2 = _tokenize(text2)
    if not set1 or not set2:
        return 0.0
    intersection = len(set1.intersection(set2))
    union = len(set1.union(set2))
    return float(intersection) / float(union) if union > 0 else 0.0


def is_semantic_duplicate(new_mcq: MCQ, existing_mcqs: List[MCQ], threshold: float = 0.70) -> bool:
    """
    Checks whether new_mcq has high token similarity to any existing MCQ.
    Returns True if similarity exceeds threshold.
    """
    for existing in existing_mcqs:
        similarity = calculate_jaccard_similarity(new_mcq.text, existing.text)
        if similarity >= threshold:
            return True
    return False
