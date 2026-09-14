import re


META_PREFIX_PATTERNS = [
    # "According to Section Chunk 1," / "According to the provided material," / "According to Section 1:"
    r"^(?:According to|Per|Following)\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|article|author|excerpt|content|\d+)[,:\s-]*",

    # "Based on the provided material," / "Based on Section Chunk 1," / "Based on the text below,"
    r"^(?:Based on|From)\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|article|author|excerpt|content|\d+)[,:\s-]*",

    # "Under complex constraints discussed in Section Chunk 1," / "Under the constraints described in..."
    r"^Under\s+(?:[a-zA-Z\s]+)?(?:discussed|described|mentioned|outlined|specified|given|detailed)\s+in\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|\d+)[,:\s-]*",

    # "As stated in Section Chunk 1," / "As discussed in the text," / "As mentioned in..."
    r"^As\s+(?:stated|described|discussed|mentioned|outlined|explained|noted|detailed|indicated)\s+in\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|\d+)[,:\s-]*",

    # "In Section Chunk 1," / "In the provided text," / "In the material,"
    r"^In\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk)[,:\s-]*",

    # "Referring to Section Chunk 1," / "With reference to..."
    r"^(?:Referring to|With reference to)\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|\d+)[,:\s-]*",

    # Generic preamble catch-all e.g. "According to the passage on page 2,"
    r"^(?:According to|Based on|As stated in|As mentioned in|As discussed in)\s+[^,?:;]*?(?:chunk|section|material|passage|text|document)[^,?:;]*?[,:\-–—]\s*",

    # "Section Chunk 1: " / "Chunk 1: " / "Section 1: "
    r"^(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+)[,:\s-]+"
]


def clean_question_text(text: str) -> str:
    """
    Sanitizes question text by removing unnatural AI meta-prefixes like
    'According to Section Chunk 1,', 'Based on the provided material,', etc.
    Ensures the resulting question starts cleanly and with proper capitalization.
    """
    if not text:
        return ""

    cleaned = text.strip()

    # Repeatedly remove any matching meta prefix
    changed = True
    while changed:
        changed = False
        for pattern in META_PREFIX_PATTERNS:
            new_cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE).strip()
            if new_cleaned != cleaned and new_cleaned:
                cleaned = new_cleaned
                changed = True

    # Strip any leftover leading punctuation e.g. ",", ":", "-", "—"
    cleaned = re.sub(r"^[,:;\-–—\s]+", "", cleaned).strip()

    # Capitalize the first letter if it starts with a letter
    if cleaned:
        cleaned = cleaned[0].upper() + cleaned[1:]

    return cleaned
