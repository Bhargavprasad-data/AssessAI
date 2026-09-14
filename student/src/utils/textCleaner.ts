const META_PREFIX_PATTERNS = [
  // "According to Section Chunk 1," / "According to the provided material," / "According to Section 1:"
  /^(?:According to|Per|Following)\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|article|author|excerpt|content|\d+)[,:\s-]*/i,

  // "Based on the provided material," / "Based on Section Chunk 1," / "Based on the text below,"
  /^(?:Based on|From)\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|article|author|excerpt|content|\d+)[,:\s-]*/i,

  // "Under complex constraints discussed in Section Chunk 1," / "Under the constraints described in..."
  /^Under\s+(?:[a-zA-Z\s]+)?(?:discussed|described|mentioned|outlined|specified|given|detailed)\s+in\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|\d+)[,:\s-]*/i,

  // "As stated in Section Chunk 1," / "As discussed in the text," / "As mentioned in..."
  /^As\s+(?:stated|described|discussed|mentioned|outlined|explained|noted|detailed|indicated)\s+in\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|\d+)[,:\s-]*/i,

  // "In Section Chunk 1," / "In the provided text," / "In the material,"
  /^In\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk)[,:\s-]*/i,

  // "Referring to Section Chunk 1," / "With reference to..."
  /^(?:Referring to|With reference to)\s+(?:the\s+)?(?:provided\s+|given\s+|uploaded\s+)?(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+|material|text|passage|document|section|chunk|\d+)[,:\s-]*/i,

  // Generic preamble catch-all e.g. "According to the passage on page 2,"
  /^(?:According to|Based on|As stated in|As mentioned in|As discussed in)\s+[^,?:;]*?(?:chunk|section|material|passage|text|document)[^,?:;]*?[,:\-–—]\s*/i,

  // "Section Chunk 1: " / "Chunk 1: " / "Section 1: "
  /^(?:Section\s+Chunk\s+\d+|Chunk\s+\d+|Section\s+\d+)[,:\s-]+/i,
];

export function cleanQuestionText(text: string): string {
  if (!text) return '';

  let cleaned = text.trim();

  let changed = true;
  while (changed) {
    changed = false;
    for (const pattern of META_PREFIX_PATTERNS) {
      const newCleaned = cleaned.replace(pattern, '').trim();
      if (newCleaned !== cleaned && newCleaned.length > 0) {
        cleaned = newCleaned;
        changed = true;
      }
    }
  }

  // Strip any leftover leading punctuation
  cleaned = cleaned.replace(/^[,:;\-–—\s]+/, '').trim();

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  return cleaned;
}
