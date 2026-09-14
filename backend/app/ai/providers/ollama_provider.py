import json
import httpx
from typing import List
from app.config import settings
from app.ai.providers.base import AIQuestionGenerator, MCQ, TransientAIError, PermanentAIError


from app.ai.cleaner import clean_question_text


class OllamaProvider(AIQuestionGenerator):
    def __init__(self, base_url: str = settings.OLLAMA_BASE_URL):
        self.base_url = base_url.rstrip("/")

    @property
    def name(self) -> str:
        return "ollama"

    @property
    def is_configured(self) -> bool:
        return bool(self.base_url)

    async def generate_mcqs(
        self,
        text_chunk: str,
        chunk_ref: str,
        difficulty_targets: List[str],
        count: int
    ) -> List[MCQ]:
        prompt = f"""Generate {count} multiple choice questions strictly grounded in the text below.
Difficulty targets requested: {', '.join(difficulty_targets)}.

Rules:
1. Ground strictly in text, ensuring questions cover distinct topics and concepts from across the text.
2. Ensure each generated question covers a DIFFERENT topic or concept rather than repeating the same subject.
3. Exactly 4 distinct options per question.
4. "correct_answer": Must be the EXACT string of the correct choice matching one of the options.
5. "correct_option_index": Must be the 0-based integer index (0, 1, 2, or 3) of the correct answer in the "options" array.
6. Verify that options[correct_option_index] matches correct_answer exactly.
7. Difficulty must be 'easy', 'medium', or 'hard'.
8. DO NOT use meta-referencing prefixes such as "According to Section Chunk...", "Based on the provided material...", "In the text...", "As mentioned...", etc. Make each question a clean, standalone, direct assessment question.
9. Output ONLY valid JSON array:
[
  {{
    "text": "Question?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Option A",
    "correct_option_index": 0,
    "difficulty": "easy"
  }}
]

Text:
\"\"\"{text_chunk}\"\"\"
"""

        payload = {
            "model": "llama3",
            "prompt": prompt,
            "stream": False,
            "format": "json"
        }

        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(f"{self.base_url}/api/generate", json=payload)
                if response.status_code != 200:
                    raise TransientAIError(f"Ollama returned status {response.status_code}: {response.text}")

                data = response.json()
                content = data.get("response", "").strip()
                parsed = json.loads(content)
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

        except (httpx.ConnectError, httpx.NetworkError) as e:
            raise PermanentAIError(f"Ollama server is not reachable at {self.base_url}: {str(e)}")
        except httpx.TimeoutException as e:
            raise TransientAIError(f"Ollama request timed out: {str(e)}")
        except Exception as e:
            if isinstance(e, (TransientAIError, PermanentAIError)):
                raise e
            raise TransientAIError(f"Ollama error: {str(e)}")
