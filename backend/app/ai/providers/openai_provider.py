import json
import httpx
from typing import List
from app.config import settings
from app.ai.providers.base import AIQuestionGenerator, MCQ, TransientAIError, PermanentAIError


from app.ai.cleaner import clean_question_text


class OpenAIProvider(AIQuestionGenerator):
    def __init__(self, api_key: str = settings.OPENAI_API_KEY):
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "openai"

    @property
    def is_configured(self) -> bool:
        return bool(self.api_key and self.api_key.strip())

    async def generate_mcqs(
        self,
        text_chunk: str,
        chunk_ref: str,
        difficulty_targets: List[str],
        count: int
    ) -> List[MCQ]:
        if not self.is_configured:
            raise PermanentAIError("OpenAI API key is not configured")

        prompt = f"""Generate {count} multiple choice questions strictly grounded in the provided text.
Difficulty targets requested: {', '.join(difficulty_targets)}.

Rules:
1. Ground every question strictly in the text, thoroughly covering all key topics, concepts, mechanisms, and definitions present in the material.
2. Ensure each generated question covers a DIFFERENT topic or concept from the text rather than repeating the same subject.
3. Exactly 4 distinct options per question.
4. Set "correct_answer" to the exact string value of the correct option, AND set "correct_option_index" to its exact 0-indexed position (0, 1, 2, or 3) in the options array.
5. The correct option MUST accurately, factually, and unambiguously answer the question.
6. Difficulty must be 'easy', 'medium', or 'hard'.
7. DO NOT use meta-referencing prefixes such as "According to Section Chunk...", "Based on the provided material...", "In the text...", "As mentioned...", etc. Make each question a clean, standalone, direct assessment question.
8. Output ONLY valid JSON:
[
  {{
    "text": "Question text?",
    "options": ["Opt 1", "Opt 2", "Opt 3", "Opt 4"],
    "correct_answer": "Opt 1",
    "correct_option_index": 0,
    "difficulty": "easy"
  }}
]

Source Text:
\"\"\"{text_chunk}\"\"\"
"""

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {"role": "system", "content": "You are a specialized test question generation engine that outputs strict JSON."},
                {"role": "user", "content": prompt}
            ],
            "temperature": 0.2
        }

        try:
            async with httpx.AsyncClient(timeout=settings.AI_TIMEOUT_SECONDS) as client:
                response = await client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
                
                if response.status_code in (401, 403):
                    raise PermanentAIError(f"OpenAI authentication error: {response.status_code} - {response.text}")
                elif response.status_code == 429 and any(term in response.text for term in ["insufficient_quota", "credit_balance_exhausted", "quota", "credit"]):
                    raise PermanentAIError(f"OpenAI quota exhausted (no credits remaining): {response.text}")
                elif response.status_code in (429, 500, 502, 503, 504):
                    raise TransientAIError(f"OpenAI transient error: {response.status_code} - {response.text}")
                elif response.status_code != 200:
                    raise PermanentAIError(f"OpenAI API error: {response.status_code} - {response.text}")

                data = response.json()
                content = data["choices"][0]["message"]["content"].strip()
                
                if "```json" in content:
                    content = content.split("```json")[1].split("```")[0].strip()
                elif "```" in content:
                    content = content.split("```")[1].split("```")[0].strip()

                parsed = json.loads(content)
                if isinstance(parsed, dict):
                    parsed = parsed.get("questions") or parsed.get("mcqs") or [parsed]
                if not isinstance(parsed, list):
                    parsed = [parsed]

                mcqs: List[MCQ] = []
                for item in parsed:
                    if not isinstance(item, dict):
                        continue
                    q_text = item.get("text") or item.get("question") or ""
                    q_options = item.get("options") or item.get("choices") or []
                    raw_correct_ans = item.get("correct_answer") or item.get("answer") or ""
                    q_correct = item.get("correct_option_index")

                    if isinstance(q_options, dict):
                        q_options = list(q_options.values())
                    clean_opts = [str(opt).strip() for opt in q_options if opt is not None and str(opt).strip()]

                    if len(clean_opts) >= 2 and q_text.strip():
                        while len(clean_opts) < 4:
                            clean_opts.append("None of the above")
                        clean_opts = clean_opts[:4]

                        final_idx = 0
                        matched = False
                        if raw_correct_ans:
                            raw_str = str(raw_correct_ans).strip().lower()
                            for idx, opt in enumerate(clean_opts):
                                if opt.lower() == raw_str:
                                    final_idx = idx
                                    matched = True
                                    break
                            if not matched:
                                letter_map = {"a": 0, "b": 1, "c": 2, "d": 3, "option a": 0, "option b": 1, "option c": 2, "option d": 3}
                                if raw_str in letter_map and letter_map[raw_str] < len(clean_opts):
                                    final_idx = letter_map[raw_str]
                                    matched = True

                        if not matched:
                            if isinstance(q_correct, str) and q_correct.strip().lower() in {"a": 0, "b": 1, "c": 2, "d": 3}:
                                final_idx = {"a": 0, "b": 1, "c": 2, "d": 3}[q_correct.strip().lower()]
                            elif str(q_correct).isdigit():
                                idx_num = int(q_correct)
                                if idx_num in (0, 1, 2, 3) and idx_num < len(clean_opts):
                                    final_idx = idx_num
                                elif 1 <= idx_num <= len(clean_opts):
                                    final_idx = idx_num - 1
                                else:
                                    final_idx = 0
                            else:
                                final_idx = 0

                        mcqs.append(MCQ(
                            text=clean_question_text(q_text),
                            options=clean_opts,
                            correct_option_index=final_idx,
                            difficulty=(item.get("difficulty") or "medium").lower(),
                            source_chunk_ref=chunk_ref,
                            is_duplicate_flag=False
                        ))
                return mcqs

        except (httpx.TimeoutException, httpx.NetworkError) as e:
            raise TransientAIError(f"OpenAI network timeout: {str(e)}")
        except json.JSONDecodeError as e:
            raise PermanentAIError(f"OpenAI response was not valid JSON: {str(e)}")
        except Exception as e:
            if isinstance(e, (TransientAIError, PermanentAIError)):
                raise e
            raise PermanentAIError(f"Unexpected error in OpenAI provider: {str(e)}")
