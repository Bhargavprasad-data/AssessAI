import asyncio
import logging
import time
from typing import Dict, List, Optional
from app.config import settings
from app.ai.providers.base import (
    AIQuestionGenerator, MCQ, AIProviderError, TransientAIError, PermanentAIError
)
from app.ai.providers.gemini_provider import GeminiProvider
from app.ai.providers.anthropic_provider import AnthropicProvider
from app.ai.providers.openai_provider import OpenAIProvider
from app.ai.providers.ollama_provider import OllamaProvider
from app.ai.providers.mock_provider import MockProvider

logger = logging.getLogger(__name__)


class ProviderHealth:
    def __init__(self, name: str):
        self.name = name
        self.success_count: int = 0
        self.failure_count: int = 0
        self.consecutive_failures: int = 0
        self.last_failure_reason: Optional[str] = None
        self.circuit_open_until: float = 0.0

    @property
    def is_circuit_open(self) -> bool:
        return time.time() < self.circuit_open_until

    def record_success(self):
        self.success_count += 1
        self.consecutive_failures = 0
        self.circuit_open_until = 0.0

    def record_failure(self, reason: str, trip_circuit: bool = False):
        self.failure_count += 1
        self.consecutive_failures += 1
        self.last_failure_reason = reason
        if trip_circuit or self.consecutive_failures >= 3:
            self.circuit_open_until = time.time() + settings.AI_CIRCUIT_BREAKER_COOLDOWN_SECONDS


class AIProviderChain:
    def __init__(self, custom_providers: Optional[List[AIQuestionGenerator]] = None):
        if custom_providers is not None:
            self.providers = {p.name: p for p in custom_providers}
        else:
            self.providers = {
                "gemini": GeminiProvider(),
                "anthropic": AnthropicProvider(),
                "openai": OpenAIProvider(),
                "ollama": OllamaProvider(),
                "mock": MockProvider()
            }
        self.health_records: Dict[str, ProviderHealth] = {
            name: ProviderHealth(name) for name in self.providers
        }

    def get_configured_providers(self, requested_order: Optional[List[str]] = None) -> List[AIQuestionGenerator]:
        order = requested_order or settings.provider_order_list
        available: List[AIQuestionGenerator] = []
        for name in order:
            provider = self.providers.get(name)
            if provider and provider.is_configured:
                available.append(provider)
        return available

    async def generate_mcqs(
        self,
        text_chunk: str,
        chunk_ref: str,
        difficulty_targets: List[str],
        count: int,
        requested_order: Optional[List[str]] = None
    ) -> List[MCQ]:
        configured = self.get_configured_providers(requested_order)
        if not configured:
            raise AIProviderError("No AI providers configured with valid API keys or base URLs.")

        all_failures: List[str] = []

        for provider in configured:
            health = self.health_records[provider.name]

            # Check circuit breaker (mock provider is never locked out)
            if health.is_circuit_open and provider.name != "mock":
                all_failures.append(f"Provider {provider.name} skipped: Circuit breaker open (cooldown active).")
                continue

            logger.info(f"Attempting question generation with provider: {provider.name}")
            
            # Execute with transient retry logic
            attempts = 0
            max_attempts = settings.AI_MAX_RETRIES + 1

            while attempts < max_attempts:
                attempts += 1
                try:
                    results = await provider.generate_mcqs(
                        text_chunk=text_chunk,
                        chunk_ref=chunk_ref,
                        difficulty_targets=difficulty_targets,
                        count=count
                    )
                    health.record_success()
                    logger.info(f"Provider {provider.name} successfully generated {len(results)} MCQs.")
                    return results

                except PermanentAIError as e:
                    reason = f"Permanent failure in {provider.name}: {str(e)}"
                    logger.warning(reason)
                    health.record_failure(reason, trip_circuit=True)
                    all_failures.append(reason)
                    # Skip immediately to next provider, no retry
                    break

                except TransientAIError as e:
                    reason = f"Transient failure in {provider.name} (attempt {attempts}/{max_attempts}): {str(e)}"
                    logger.warning(reason)
                    if attempts < max_attempts:
                        # Exponential backoff
                        backoff = 0.2 * (2 ** (attempts - 1))
                        await asyncio.sleep(backoff)
                    else:
                        health.record_failure(reason, trip_circuit=False)
                        all_failures.append(f"{provider.name} exhausted all {max_attempts} retries: {str(e)}")

                except Exception as e:
                    reason = f"Unexpected failure in {provider.name}: {str(e)}"
                    logger.error(reason)
                    health.record_failure(reason, trip_circuit=True)
                    all_failures.append(reason)
                    break

        # If we reach here, every configured provider failed
        failure_summary = " | ".join(all_failures)
        raise AIProviderError(f"All configured AI providers failed. Reasons: {failure_summary}")
