import re
import logging
from typing import List, Tuple, Optional
from app.config import settings
from app.ai.providers.base import MCQ, AIProviderError
from app.ai.providers.chain import AIProviderChain
from app.ai.validator import validate_mcq
from app.ai.deduplication import is_semantic_duplicate
from app.ai.cleaner import clean_question_text

logger = logging.getLogger(__name__)


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> List[Tuple[str, str]]:
    """
    Intelligently splits text into topic-aware chunks based on section headings,
    page markers, and paragraph boundaries.
    Returns list of (chunk_text, chunk_ref).
    """
    raw_paragraphs = [p.strip() for p in text.replace("\r", "\n").split("\n\n") if p.strip()]
    if not raw_paragraphs:
        raw_paragraphs = [p.strip() for p in text.split("\n") if p.strip()]

    chunks: List[Tuple[str, str]] = []
    current_chunk: List[str] = []
    current_length = 0
    current_topic = "General Overview"
    topic_index = 1

    # Regex for topic / section headings
    heading_pattern = re.compile(
        r"^(?:#+\s*|(?:Chapter|Section|Module|Topic|Unit|Part)\s+[\d\w\.\-]+[:\s]*|\d+[\.\)]\s+|[A-Z0-9\s\-_]{3,40}:|--- Page \d+ ---)",
        re.IGNORECASE
    )

    for para in raw_paragraphs:
        lines = para.split("\n")
        first_line = lines[0].strip()

        # Check if paragraph starts with a heading or topic marker
        is_heading = bool(heading_pattern.match(first_line)) or (len(first_line) < 60 and first_line.endswith(":"))

        if is_heading:
            clean_topic = re.sub(r"^(?:#+\s*|---\s*|\s*---)", "", first_line).strip().strip(":#- ")
            if clean_topic:
                current_topic = clean_topic[:50]

        if (current_length + len(para) > chunk_size and current_chunk) or (is_heading and current_length > 200):
            combined = "\n\n".join(current_chunk)
            chunks.append((combined, f"Topic {topic_index}: {current_topic}"))
            topic_index += 1
            current_chunk = [para]
            current_length = len(para)
        else:
            current_chunk.append(para)
            current_length += len(para)

    if current_chunk:
        combined = "\n\n".join(current_chunk)
        chunks.append((combined, f"Topic {topic_index}: {current_topic}"))

    if not chunks and text.strip():
        chunks.append((text.strip(), "Main Document Topic"))

    return chunks


_DEFAULT_CHAIN: Optional[AIProviderChain] = None


def get_default_provider_chain() -> AIProviderChain:
    global _DEFAULT_CHAIN
    if _DEFAULT_CHAIN is None:
        _DEFAULT_CHAIN = AIProviderChain()
    return _DEFAULT_CHAIN


async def run_question_generation_pipeline(
    material_text: str,
    requested_count: int,
    chain: Optional[AIProviderChain] = None
) -> Tuple[List[MCQ], int, Optional[str]]:
    """
    Executes question generation ensuring all topics across the entire uploaded
    document are thoroughly covered, producing exactly `requested_count` valid MCQs.
    Difficulty is ENFORCED: questions are stamped easy/medium/hard in a round-robin
    order regardless of what the AI model returns, guaranteeing an even distribution.
    Returns: (list of valid MCQs, valid_count, failure_reason)
    """
    if not material_text or len(material_text.strip()) < 30:
        return [], 0, "Uploaded course material contains insufficient text for question generation."

    if requested_count <= 0:
        requested_count = 15

    provider_chain = chain or get_default_provider_chain()
    chunks = chunk_text(material_text)
    if not chunks:
        return [], 0, "No text chunks could be extracted from course material."

    valid_mcqs: List[MCQ] = []
    max_rounds = settings.AI_MAX_REGENERATION_ROUNDS  # 3 rounds
    current_round = 0
    failure_reason: Optional[str] = None
    # Strictly enforced difficulty cycle — easy, medium, hard, easy, medium, hard ...
    difficulties_cycle = ["easy", "medium", "hard"]

    total_chunks = len(chunks)
    used_chunk_indices = set()

    # Distribute requested_count across chunks covering start to end of PDF
    while len(valid_mcqs) < requested_count and current_round < max_rounds:
        current_round += 1
        shortfall = requested_count - len(valid_mcqs)
        logger.info(f"AI Generation Round {current_round}/{max_rounds}: target {requested_count}, needed {shortfall} across {total_chunks} topics.")

        chunk_allocations = []
        if current_round == 1:
            # Round 1: Select chunks evenly spaced across the entire document
            if shortfall <= total_chunks:
                step = total_chunks / shortfall
                for i in range(shortfall):
                    idx = int(i * step)
                    if idx < total_chunks:
                        chunk_allocations.append((idx, chunks[idx], 1))
            else:
                base = shortfall // total_chunks
                rem = shortfall % total_chunks
                for i in range(total_chunks):
                    chunk_allocations.append((i, chunks[i], base + (1 if i < rem else 0)))
        else:
            # Round 2+: Try all unused chunks first, then any available chunk
            candidate_indices = [i for i in range(total_chunks) if i not in used_chunk_indices]
            if not candidate_indices:
                candidate_indices = list(range(total_chunks))

            for idx in candidate_indices:
                chunk_allocations.append((idx, chunks[idx], 1))

        for chunk_idx, (chunk_text_data, chunk_ref), count_for_chunk in chunk_allocations:
            if len(valid_mcqs) >= requested_count:
                break
            if count_for_chunk <= 0:
                continue

            needed_now = min(count_for_chunk, requested_count - len(valid_mcqs))

            # Build the ordered difficulty targets for this slot range.
            # These are ENFORCED onto the returned questions regardless of AI output.
            slot_start = len(valid_mcqs)
            difficulty_targets = [
                difficulties_cycle[(slot_start + i) % len(difficulties_cycle)]
                for i in range(needed_now)
            ]

            try:
                candidates = await provider_chain.generate_mcqs(
                    text_chunk=chunk_text_data,
                    chunk_ref=chunk_ref,
                    difficulty_targets=difficulty_targets,
                    count=needed_now
                )

                if candidates:
                    used_chunk_indices.add(chunk_idx)

                # Assign difficulties strictly from the pre-computed targets in order.
                # The AI's own difficulty label is ignored — we enforce the distribution.
                enforced_slot = 0
                for candidate in candidates:
                    if len(valid_mcqs) >= requested_count:
                        break

                    # 0. Enforce the target difficulty for this slot
                    if enforced_slot < len(difficulty_targets):
                        candidate.difficulty = difficulty_targets[enforced_slot]
                    enforced_slot += 1

                    # 1. Sanitize meta-referencing phrases from question text
                    candidate.text = clean_question_text(candidate.text)

                    # 2. Structural Validation
                    is_valid, validation_error = validate_mcq(candidate)
                    if not is_valid:
                        logger.warning(f"Rejected invalid MCQ: {validation_error}")
                        continue

                    # 3. Semantic Duplicate Check (Flag, do not reject)
                    if is_semantic_duplicate(candidate, valid_mcqs):
                        candidate.is_duplicate_flag = True

                    valid_mcqs.append(candidate)

            except AIProviderError as e:
                logger.error(f"Chunk {chunk_ref} provider error in round {current_round}: {str(e)}")
                failure_reason = str(e)
            except Exception as e:
                logger.error(f"Unexpected error in chunk {chunk_ref} round {current_round}: {str(e)}")
                failure_reason = str(e)

    # Trim to exact requested count if any extra were generated
    final_mcqs = valid_mcqs[:requested_count]

    if not final_mcqs:
        return [], 0, failure_reason or "All generation attempts produced invalid or empty questions."

    logger.info(
        f"Generation complete: {len(final_mcqs)} questions. "
        f"Difficulty breakdown: easy={sum(1 for q in final_mcqs if q.difficulty=='easy')}, "
        f"medium={sum(1 for q in final_mcqs if q.difficulty=='medium')}, "
        f"hard={sum(1 for q in final_mcqs if q.difficulty=='hard')}"
    )
    return final_mcqs, len(final_mcqs), None
