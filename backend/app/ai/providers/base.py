from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List


@dataclass
class MCQ:
    text: str
    options: List[str]  # exactly 4 options
    correct_option_index: int  # 0..3
    difficulty: str  # 'easy', 'medium', 'hard'
    source_chunk_ref: str
    is_duplicate_flag: bool = False


class AIProviderError(Exception):
    """Base exception for AI provider failures."""
    pass


class TransientAIError(AIProviderError):
    """Transient failures: timeouts, rate limits (429), server 5xx errors."""
    pass


class PermanentAIError(AIProviderError):
    """Permanent failures: invalid credentials, authentication errors, bad configuration."""
    pass


class AIQuestionGenerator(ABC):
    @property
    @abstractmethod
    def name(self) -> str:
        """Provider identifier."""
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """Whether valid configuration/keys are provided."""
        pass

    @abstractmethod
    async def generate_mcqs(
        self,
        text_chunk: str,
        chunk_ref: str,
        difficulty_targets: List[str],
        count: int
    ) -> List[MCQ]:
        """Generate MCQs from a text chunk according to difficulty targets."""
        pass
