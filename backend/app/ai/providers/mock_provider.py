import re
import random
import hashlib
from typing import List, Tuple, Dict, Optional, Set
from app.ai.providers.base import AIQuestionGenerator, MCQ, TransientAIError, PermanentAIError
from app.ai.cleaner import clean_question_text


class MockProvider(AIQuestionGenerator):
    """
    Intelligent NLP question generator that extracts key concepts, definitions,
    principles, and relationships directly from uploaded course material.
    Produces high-quality, grammatically rigorous questions strictly grounded in the PDF.
    """

    def __init__(self, should_fail_transient: bool = False, should_fail_permanent: bool = False):
        self._should_fail_transient = should_fail_transient
        self._should_fail_permanent = should_fail_permanent

    @property
    def name(self) -> str:
        return "mock"

    @property
    def is_configured(self) -> bool:
        return True

    def _clean_text(self, text: str) -> str:
        # Remove page markers and formatting artifacts
        t = re.sub(r"--- Page \d+ ---", "", text)
        t = re.sub(r"\[\d+\]", "", t)
        t = re.sub(r"Page \d+ of \d+", "", t, flags=re.IGNORECASE)
        return t.strip()

    def _is_junk_line(self, line: str) -> bool:
        """Filters out table of contents, syllabus headings, math formulas, code snippets, and slide headers/footers."""
        s = line.strip()
        if len(s) < 15:
            return True
        # Slide headers, university, author and faculty metadata
        if re.search(r"\b(?:Professor|Prof\.|Dr\.|Faculty|Department|Dept\.|College|University|Institute|MVGRCE|LC\s*\d+|Slide\s*\d+|Page\s*\d+)\b", s, re.IGNORECASE):
            return True
        # Pure chapter/unit markers like "Unit III DEADLOCKS AND MEMORY MANAGEMENT"
        if re.match(r"^(?:Unit\s+[I|V|X|\d]+|Chapter\s+\d+|Module\s+\d+|Syllabus|Contents|Index|Section\s+\d+)\b", s, re.IGNORECASE):
            return True
        # Source code lines with programming syntax (e.g., semicolons, curly braces, // comments, return statements)
        if re.search(r"[;\{]|\/\/|#include|\bint\s+\w+\s*\(|\breturn\s+\w+|\bvoid\s+\w+", s):
            return True
        # Math formulas or variable assignments like "=5 F(printer) =12" or "R2 Rm}"
        if re.search(r"[=><]\s*\d+|[{}\[\]\\]{2,}|^\s*[a-zA-Z0-9]\s*=", s):
            return True
        # Lines with excessive special characters
        special_char_count = len(re.findall(r"[\=\+\*\/\_\{\}\<\>\|\\~#;]", s))
        if special_char_count > 3:
            return True
        return False

    def _extract_sentences(self, text: str) -> List[str]:
        cleaned = self._clean_text(text)
        lines = cleaned.replace("\r", "\n").split("\n")

        # Paragraph reconstruction
        paragraphs: List[str] = []
        current: List[str] = []

        for line in lines:
            line_str = line.strip()
            if not line_str:
                if current:
                    paragraphs.append(" ".join(current))
                    current = []
                continue
            if self._is_junk_line(line_str):
                continue
            current.append(line_str)

        if current:
            paragraphs.append(" ".join(current))

        sentences: List[str] = []
        for p in paragraphs:
            # Split sentences on standard punctuation (. ! ?)
            parts = re.split(r"(?<=[.!?])\s+(?=[A-Z0-9])", p)
            for part in parts:
                s = part.strip().strip(".,;:()")
                # Remove leading bullets or numbers
                s = re.sub(r"^(?:[\d\.\-\*\•\>\#\(\)a-zA-Z]{1,4}\s+|[a-zA-Z]\)\s+)", "", s).strip()
                if len(s) >= 25 and len(s.split()) >= 5 and not self._is_junk_line(s):
                    sentences.append(s)

        return sentences

    def _clean_subject(self, subj: str) -> Optional[str]:
        """Validates and cleans a subject noun phrase."""
        s = subj.strip()
        # Remove leading articles and unit headings
        s = re.sub(r"^(?:A|An|The|Unit\s+[I|V|X|\d]+|Chapter\s+\d+)\s+", "", s, flags=re.IGNORECASE).strip()
        # Remove leading punctuation
        s = re.sub(r"^[^a-zA-Z0-9]+", "", s).strip()
        # Discard if starts with common verbs or conjunctions
        bad_start_words = {
            "must", "should", "could", "would", "can", "may", "might", "will", "shall",
            "is", "are", "was", "were", "has", "have", "had", "do", "does", "did",
            "let", "consider", "illustrate", "show", "note", "suppose", "assume",
            "because", "since", "although", "while", "if", "when", "where", "how",
            "this", "that", "these", "those", "each", "every", "some", "any", "all",
            "behavior", "structure", "content", "example", "figure", "table", "step"
        }
        words = s.split()
        if not words or len(words) > 6:
            return None
        if words[0].lower() in bad_start_words:
            return None
        # Discard if ends with dangling prepositions/conjunctions
        bad_end_words = {"of", "the", "a", "an", "in", "on", "at", "to", "for", "with", "and", "or", "by", "from", "that", "which"}
        if words[-1].lower() in bad_end_words:
            return None
        return s

    def _extract_fact(self, sentence: str) -> Optional[Dict[str, str]]:
        """
        Extracts subject concept and informative predicate from a sentence.
        """
        s = re.sub(
            r"^(?:In addition|Furthermore|Moreover|However|Specifically|Generally|First|Second|Finally|Note that|In summary|Importantly|Essentially|Typically|Clearly|Thus|Therefore|In other words)[,:\s]+",
            "",
            sentence,
            flags=re.IGNORECASE
        ).strip()

        # Definition and action patterns: "X is/are/describes/uses/defines Y"
        relational_verbs = [
            r"is defined as", r"is referred to as", r"refers to", r"is considered",
            r"is described as", r"is characterized by", r"is a mechanism that",
            r"is an algorithm that", r"is a technique that", r"is a process that",
            r"is responsible for", r"is used to", r"functions as", r"operates by",
            r"consists of", r"is composed of", r"provides", r"ensures", r"guarantees",
            r"manages", r"controls", r"executes", r"performs", r"allocates", r"prevents",
            r"detects", r"recovers from", r"allows", r"enables", r"describes", r"defines",
            r"measures", r"represents", r"resists", r"indicates", r"calculates",
            r"transforms", r"implements", r"specifies", r"uses", r"builds", r"contains",
            r"includes", r"requires", r"supports", r"connects", r"transmits", r"stores",
            r"regulates", r"produces", r"facilitates", r"optimizes", r"handles",
            r"processes", r"analyzes", r"creates", r"maintains", r"is", r"are", r"was", r"were",
            r"has", r"have"
        ]

        pattern = rf"^([A-Z0-9][A-Za-z0-9_\-\s\(\)\/]{{1,50}}?)\s+({'|'.join(relational_verbs)})\s+(.+)$"
        m = re.match(pattern, s, re.IGNORECASE)
        if m:
            raw_subj = m.group(1).strip()
            verb = m.group(2).strip()
            pred_rest = m.group(3).strip()

            subj_clean = self._clean_subject(raw_subj)
            if not subj_clean:
                subj_clean = raw_subj

            # Clean predicate: ensure no leading repeated "is" or punctuation
            pred_clean = f"{verb} {pred_rest}".strip()
            pred_clean = re.sub(r"^(?:is|are)\s+(?:is|are)\b", "is", pred_clean, flags=re.IGNORECASE)

            if len(pred_clean) >= 8 and not self._is_junk_line(subj_clean):
                if not re.search(r"^[=><]|[{}\\]", pred_clean):
                    return {
                        "subject": subj_clean,
                        "predicate": pred_clean,
                        "original": sentence
                    }

        # Definition via colon: "Topic: Description"
        colon_match = re.match(r"^([A-Z0-9][A-Za-z0-9_\-\s\(\)\/]{1,45})\s*:\s+(.{8,})$", s)
        if colon_match:
            raw_subj, desc = colon_match.groups()
            subj_clean = self._clean_subject(raw_subj) or raw_subj
            if subj_clean and not self._is_junk_line(subj_clean):
                return {
                    "subject": subj_clean,
                    "predicate": f"is {desc.strip()}",
                    "original": sentence
                }

        # Fallback for any declarative statement
        words = s.split()
        if len(words) >= 2:
            subj_cand = " ".join(words[: min(2, len(words) - 1)]).strip(".,;:()")
            subj_clean = self._clean_subject(subj_cand) or subj_cand
            pred_clean = " ".join(words[min(2, len(words) - 1) :]).strip()
            if subj_clean and pred_clean and not self._is_junk_line(subj_clean):
                return {
                    "subject": subj_clean,
                    "predicate": pred_clean,
                    "original": sentence
                }

        return None

    def _generate_distractors(self, correct_pred: str, all_facts: List[Dict[str, str]], seed: int) -> List[str]:
        """
        Synthesizes plausible academic distractors strictly using other concepts
        and valid mechanisms from the document.
        """
        distractors: List[str] = []
        rng = random.Random(seed)

        # 1. Borrow predicates from other real facts in the same document
        other_preds = [
            f["predicate"] for f in all_facts
            if f["predicate"].strip().lower() != correct_pred.strip().lower() and len(f["predicate"]) >= 8
        ]
        rng.shuffle(other_preds)
        for p in other_preds:
            if len(distractors) >= 3:
                break
            p_formatted = p[0].upper() + p[1:] if p else p
            if not p_formatted.endswith("."):
                p_formatted += "."
            if p_formatted not in distractors and p_formatted.lower() != correct_pred.lower():
                distractors.append(p_formatted)

        # 2. Semantic negation/antonym swaps on the correct answer
        antonym_swaps = [
            (r"\ballocates\b", "deallocates and revokes"),
            (r"\bprevents\b", "permits and causes"),
            (r"\bdetects\b", "ignores without detecting"),
            (r"\bguarantees\b", "does not guarantee"),
            (r"\breliable\b", "unreliable and lossy"),
            (r"\bsynchronous\b", "strictly asynchronous"),
            (r"\basynchronous\b", "strictly synchronous"),
            (r"\bstatic\b", "dynamically allocated"),
            (r"\bdynamic\b", "statically fixed"),
            (r"\bpreemptible\b", "non-preemptible"),
            (r"\bnon-preemptible\b", "preemptible"),
            (r"\benables\b", "prohibits and restricts"),
            (r"\bmaximizes\b", "minimizes"),
            (r"\bminimizes\b", "maximizes"),
            (r"\bconverts\b", "prevents the transformation of"),
            (r"\bmanages\b", "bypasses the management of"),
            (r"\bensures\b", "fails to ensure"),
        ]

        mutated = correct_pred
        for src, target in antonym_swaps:
            if re.search(src, mutated, re.IGNORECASE):
                mutated = re.sub(src, target, mutated, count=1, flags=re.IGNORECASE)
                break

        if mutated.lower() != correct_pred.lower():
            mut_formatted = mutated[0].upper() + mutated[1:]
            if not mut_formatted.endswith("."):
                mut_formatted += "."
            if mut_formatted not in distractors and len(distractors) < 3:
                distractors.append(mut_formatted)

        # 3. Cross-combination with another subject's mechanism
        if len(distractors) < 3 and len(all_facts) > 1:
            for f in all_facts:
                if len(distractors) >= 3:
                    break
                candidate_d = f"Operates by using {f['subject']} to {f['predicate']}"
                candidate_formatted = candidate_d[0].upper() + candidate_d[1:]
                if not candidate_formatted.endswith("."):
                    candidate_formatted += "."
                if candidate_formatted not in distractors and candidate_formatted.lower() != correct_pred.lower():
                    distractors.append(candidate_formatted)

        # 4. Fallback contextual alternatives
        fallback_counterparts = [
            "Acts as an optional secondary mechanism without resource constraints.",
            "Requires manual intervention rather than automated execution.",
            "Operates exclusively in user mode without kernel privilege."
        ]
        for fb in fallback_counterparts:
            if len(distractors) >= 3:
                break
            if fb not in distractors and fb.lower() != correct_pred.lower():
                distractors.append(fb)

        return distractors[:3]

    def _format_option_text(self, text: str) -> str:
        """Cleans and standardizes option sentence grammar."""
        s = text.strip()
        # Remove redundant leading 'is It is', 'is A', 'is The'
        s = re.sub(r"^(?:is|are|was|were)\s+([A-Z])", r"\1", s)
        s = re.sub(r"^(?:is|are|was|were)\s+(?:a|an|the)\s+", lambda m: m.group(0).split()[-1].capitalize() + " ", s, flags=re.IGNORECASE)
        # Capitalize first letter
        if s:
            s = s[0].upper() + s[1:]
        if not s.endswith("."):
            s += "."
        return s

    async def generate_mcqs(
        self,
        text_chunk: str,
        chunk_ref: str,
        difficulty_targets: List[str],
        count: int
    ) -> List[MCQ]:
        if self._should_fail_permanent:
            raise PermanentAIError("Mock provider permanent failure (simulated auth/config error)")
        if self._should_fail_transient:
            raise TransientAIError("Mock provider transient failure (simulated timeout/503)")

        sentences = self._extract_sentences(text_chunk)
        if not sentences:
            raw_lines = [l.strip() for l in text_chunk.split("\n") if len(l.strip()) >= 5 and not self._is_junk_line(l)]
            sentences = raw_lines if raw_lines else [text_chunk.strip()] if text_chunk.strip() else []

        if not sentences:
            return []

        facts: List[Dict[str, str]] = []
        seen_subjects: Set[str] = set()

        for s in sentences:
            f = self._extract_fact(s)
            if f and f["subject"].lower() not in seen_subjects:
                facts.append(f)
                seen_subjects.add(f["subject"].lower())

        # If strict grammar facts are sparse, build from any available sentences
        if len(facts) < count:
            for s in sentences:
                words = s.split()
                if len(words) >= 2:
                    subj_cand = " ".join(words[: min(2, len(words) - 1)]).strip(".,;:()")
                    subj = self._clean_subject(subj_cand) or subj_cand
                    pred = " ".join(words[min(2, len(words) - 1) :]).strip()
                    if subj and pred and subj.lower() not in seen_subjects:
                        facts.append({"subject": subj, "predicate": pred, "original": s})
                        seen_subjects.add(subj.lower())

        if not facts:
            return []

        results: List[MCQ] = []
        total_facts = len(facts)

        for i in range(count):
            diff = difficulty_targets[i % len(difficulty_targets)]
            fact = facts[i % total_facts]
            subject = fact["subject"]
            predicate = fact["predicate"]

            # Format correct answer
            correct_answer = self._format_option_text(predicate)

            # Templates tailored to difficulty
            if diff == "easy":
                q_templates = [
                    f"What is the primary definition or role of {subject}?",
                    f"Which statement accurately describes {subject}?",
                    f"What function is performed by {subject} in the system?",
                ]
            elif diff == "medium":
                q_templates = [
                    f"How does {subject} operate according to the course material?",
                    f"Which of the following explains the mechanism of {subject}?",
                    f"In what way is {subject} utilized during system execution?",
                ]
            else:  # hard
                q_templates = [
                    f"What is the core principle or operational constraint governing {subject}?",
                    f"Under what architectural conditions is {subject} implemented?",
                    f"Which fundamental requirement must be satisfied regarding {subject}?",
                ]

            q_text = q_templates[(i + len(subject)) % len(q_templates)]

            # Generate 3 distinct distractors
            distractors = self._generate_distractors(predicate, facts, seed=(i * 37 + len(subject)))
            clean_distractors = [self._format_option_text(d) for d in distractors]

            # Assign correct index deterministically pseudo-randomly
            correct_idx = (int(hashlib.md5(f"{subject}_{i}_{diff}".encode()).hexdigest(), 16) % 4)

            options = list(clean_distractors[:3])
            options.insert(correct_idx, correct_answer)

            # Ensure all 4 options are distinct strings
            unique_options = []
            for opt in options:
                if opt in unique_options:
                    opt = f"{opt[:-1]} (Alternative scenario)."
                unique_options.append(opt)

            results.append(MCQ(
                text=clean_question_text(q_text),
                options=unique_options,
                correct_option_index=correct_idx,
                difficulty=diff,
                source_chunk_ref=chunk_ref,
                is_duplicate_flag=False
            ))

        return results


