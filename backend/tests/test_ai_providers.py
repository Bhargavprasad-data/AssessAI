import pytest
from typing import List
from app.ai.providers.base import (
    AIQuestionGenerator, MCQ, TransientAIError, PermanentAIError, AIProviderError
)
from app.ai.providers.mock_provider import MockProvider
from app.ai.providers.chain import AIProviderChain
from app.ai.validator import validate_mcq
from app.ai.deduplication import is_semantic_duplicate
from app.ai.generator import run_question_generation_pipeline


class FailingProvider(AIQuestionGenerator):
    def __init__(self, name: str, fail_mode: str):
        self._name = name
        self._fail_mode = fail_mode
        self.call_count = 0

    @property
    def name(self) -> str:
        return self._name

    @property
    def is_configured(self) -> bool:
        return True

    async def generate_mcqs(self, text_chunk: str, chunk_ref: str, difficulty_targets: List[str], count: int) -> List[MCQ]:
        self.call_count += 1
        if self._fail_mode == "permanent":
            raise PermanentAIError(f"Permanent auth error on {self._name}")
        elif self._fail_mode == "transient":
            raise TransientAIError(f"Rate limit / timeout on {self._name}")
        return []


@pytest.mark.asyncio
async def test_mock_provider_structural_validity():
    provider = MockProvider()
    sample_text = "Supervised learning uses labeled datasets to train algorithms to classify data or predict outcomes accurately."
    mcqs = await provider.generate_mcqs(
        text_chunk=sample_text,
        chunk_ref="Section 1",
        difficulty_targets=["easy", "medium", "hard"],
        count=3
    )
    assert len(mcqs) == 3
    for mcq in mcqs:
        is_valid, err = validate_mcq(mcq)
        assert is_valid is True, f"Validation error: {err}"
        assert len(mcq.options) == 4
        assert 0 <= mcq.correct_option_index <= 3
        assert mcq.difficulty in ("easy", "medium", "hard")
        assert mcq.source_chunk_ref == "Section 1"
        # Verify question is dynamically grounded in sample text
        assert "Supervised learning" in mcq.text or "Supervised learning" in str(mcq.options)
        assert "labeled datasets" in str(mcq.options)


@pytest.mark.asyncio
async def test_chain_failover_transient_to_fallback():
    failing_transient = FailingProvider("transient_p1", "transient")
    working_mock = MockProvider()

    chain = AIProviderChain(custom_providers=[failing_transient, working_mock])
    mcqs = await chain.generate_mcqs(
        text_chunk="Test material content",
        chunk_ref="Chunk 1",
        difficulty_targets=["easy"],
        count=1,
        requested_order=["transient_p1", "mock"]
    )
    assert len(mcqs) == 1
    # Failing provider retried and failed, then fell through to mock
    assert failing_transient.call_count > 1
    assert chain.health_records["mock"].success_count == 1


@pytest.mark.asyncio
async def test_chain_permanent_error_skips_immediately_no_retry():
    failing_permanent = FailingProvider("perm_p1", "permanent")
    working_mock = MockProvider()

    chain = AIProviderChain(custom_providers=[failing_permanent, working_mock])
    mcqs = await chain.generate_mcqs(
        text_chunk="Test content",
        chunk_ref="Chunk 1",
        difficulty_targets=["medium"],
        count=1,
        requested_order=["perm_p1", "mock"]
    )
    assert len(mcqs) == 1
    # Permanent failure should execute exactly once (zero retries)
    assert failing_permanent.call_count == 1


@pytest.mark.asyncio
async def test_chain_all_providers_down_raises_detailed_error():
    p1 = FailingProvider("p1", "permanent")
    p2 = FailingProvider("p2", "transient")

    chain = AIProviderChain(custom_providers=[p1, p2])
    with pytest.raises(AIProviderError) as exc_info:
        await chain.generate_mcqs(
            text_chunk="Test content",
            chunk_ref="Chunk 1",
            difficulty_targets=["easy"],
            count=1,
            requested_order=["p1", "p2"]
        )
    err_str = str(exc_info.value)
    assert "All configured AI providers failed" in err_str
    assert "Permanent auth error on p1" in err_str
    assert "p2 exhausted all" in err_str


@pytest.mark.asyncio
async def test_pipeline_regeneration_capped_at_three_rounds():
    """Verify that generation shortfall caps at 3 rounds and returns actual valid count."""
    mock = MockProvider()
    chain = AIProviderChain(custom_providers=[mock])

    text = "Machine learning algorithms build a model based on sample data, known as training data, in order to make predictions."
    mcqs, valid_count, err = await run_question_generation_pipeline(
        material_text=text,
        requested_count=5,
        chain=chain
    )
    assert len(mcqs) == 5
    assert valid_count == 5
    assert err is None


def test_semantic_duplicate_flagging():
    q1 = MCQ(
        text="What is the primary definition of Supervised Learning algorithms?",
        options=["A", "B", "C", "D"],
        correct_option_index=0,
        difficulty="easy",
        source_chunk_ref="Ref 1"
    )
    # Highly similar wording
    q2 = MCQ(
        text="What is the primary definition of Supervised Learning algorithms?",
        options=["W", "X", "Y", "Z"],
        correct_option_index=1,
        difficulty="easy",
        source_chunk_ref="Ref 2"
    )
    # Distinct question
    q3 = MCQ(
        text="How does backpropagation calculate derivatives using the chain rule?",
        options=["1", "2", "3", "4"],
        correct_option_index=0,
        difficulty="medium",
        source_chunk_ref="Ref 3"
    )

    assert is_semantic_duplicate(q2, [q1]) is True
    assert is_semantic_duplicate(q3, [q1]) is False


def test_clean_question_text_removes_unnecessary_meta_prefixes():
    from app.ai.cleaner import clean_question_text

    examples = [
        (
            "According to Section Chunk 1, what is the fundamental definition of Label?",
            "What is the fundamental definition of Label?"
        ),
        (
            "Based on the provided material, how does widget apply when compared to standard alternatives?",
            "How does widget apply when compared to standard alternatives?"
        ),
        (
            "Under complex constraints discussed in Section Chunk 1, what is the multi-concept implication of integrating methods?",
            "What is the multi-concept implication of integrating methods?"
        ),
        (
            "As stated in Chunk 3, which component handles backpropagation?",
            "Which component handles backpropagation?"
        ),
        (
            "In the provided text, why is regularization used?",
            "Why is regularization used?"
        ),
        (
            "Section Chunk 2: What is the main advantage of gradient descent?",
            "What is the main advantage of gradient descent?"
        ),
        (
            "What is the definition of neural network?",
            "What is the definition of neural network?"
        ),
    ]

    for raw, expected in examples:
        assert clean_question_text(raw) == expected
