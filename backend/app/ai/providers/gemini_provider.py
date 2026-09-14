import json
import logging
import httpx
from typing import List
from app.config import settings
from app.ai.providers.base import AIQuestionGenerator, MCQ, TransientAIError, PermanentAIError
from app.ai.cleaner import clean_question_text

logger = logging.getLogger(__name__)


class GeminiProvider(AIQuestionGenerator):
    """
    Google Gemini question generator provider using Gemini 1.5 / 2.0 Flash REST API.
    """

    def __init__(self, api_key: str = settings.GEMINI_API_KEY):
        self.api_key = api_key

    @property
    def name(self) -> str:
        return "gemini"

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
            raise PermanentAIError("Gemini API key is not configured")

        prompt = f"""You are an expert exam question generator. Generate exactly {count} multiple choice questions strictly based on the provided text.
Difficulty targets requested: {', '.join(difficulty_targets)}.

Rules:
1. Ground every question strictly in the provided text, ensuring distinct coverage across the topics, definitions, concepts, and mechanisms described.
2. Ensure each generated question covers a DIFFERENT topic or concept rather than repeating the same subject.
3. Exactly 4 distinct options per question.
4. Set "correct_answer" to the exact string value of the correct option, AND set "correct_option_index" to its exact 0-indexed position (0, 1, 2, or 3) in the options array.
5. The correct option MUST accurately, factually, and unambiguously answer the question.
6. Difficulty must be 'easy', 'medium', or 'hard'.
7. DO NOT use meta-referencing prefixes such as "According to Section Chunk...", "Based on the provided material...", "In the text...", "As mentioned...", etc. Make each question a clean, standalone, direct assessment question.
8. Output ONLY a valid JSON array matching this exact schema with no extra text or markdown outside JSON:
[
  {{
    "text": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A",
    "correct_option_index": 0,
    "difficulty": "easy"
  }}
]

Source Text:
\"\"\"{text_chunk}\"\"\"
"""

        models_to_try = ["gemini-flash-latest", "gemini-pro-latest", "gemini-flash-lite-latest", "gemini-2.5-flash-lite"]
        last_error = None

        for model_name in models_to_try:
            endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={self.api_key}"
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0.2
                }
            }

            try:
                async with httpx.AsyncClient(timeout=12.0) as client:
                    response = await client.post(endpoint, json=payload)

                    if response.status_code in (401, 403):
                        raise PermanentAIError(f"Gemini API authentication error: {response.status_code} - {response.text}")
                    elif response.status_code in (429, 500, 502, 503, 504, 404):
                        # Try next available fallback model
                        last_error = response.text
                        continue
                    elif response.status_code != 200:
                        raise PermanentAIError(f"Gemini API error: {response.status_code} - {response.text}")

                    data = response.json()
                    candidates = data.get("candidates", [])
                    if not candidates:
                        raise PermanentAIError("Gemini returned no candidates.")

                    content_parts = candidates[0].get("content", {}).get("parts", [])
                    if not content_parts:
                        raise PermanentAIError("Gemini returned empty content.")

                    raw_text = content_parts[0].get("text", "").strip()

                    if "```json" in raw_text:
                        raw_text = raw_text.split("```json")[1].split("```")[0].strip()
                    elif "```" in raw_text:
                        raw_text = raw_text.split("```")[1].split("```")[0].strip()

                    parsed = json.loads(raw_text)
                    if isinstance(parsed, dict):
                        if "questions" in parsed:
                            parsed = parsed["questions"]
                        elif "mcqs" in parsed:
                            parsed = parsed["mcqs"]
                        elif "items" in parsed:
                            parsed = parsed["items"]
                        else:
                            parsed = [parsed]

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
                        if q_correct is None:
                            q_correct = item.get("answer_index")

                        # Ensure 4 string options
                        if isinstance(q_options, dict):
                            q_options = list(q_options.values())
                        
                        clean_opts = [str(opt).strip() for opt in q_options if opt is not None and str(opt).strip()]
                        
                        if len(clean_opts) >= 2 and q_text.strip():
                            # Pad to 4 options if fewer returned
                            while len(clean_opts) < 4:
                                clean_opts.append("None of the above")
                            clean_opts = clean_opts[:4]

                            # Ground-truth index resolution:
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
                    if mcqs:
                        return mcqs

            except (httpx.TimeoutException, httpx.NetworkError) as e:
                raise TransientAIError(f"Gemini network timeout: {str(e)}")
            except json.JSONDecodeError as e:
                raise PermanentAIError(f"Gemini output was not valid JSON: {str(e)}")
            except Exception as e:
                if isinstance(e, (TransientAIError, PermanentAIError)):
                    raise e
                raise PermanentAIError(f"Unexpected error in Gemini provider: {str(e)}")

        raise PermanentAIError(f"Gemini API error: All models failed. Last response: {last_error}")
