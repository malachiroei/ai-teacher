/** Normalize tutor lines before Edge neural TTS — natural Israeli cadence. */
export function prepareTextForTts(text: string) {
  return text
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\uFE0F\u200D\u20E3]/g, "")
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\s*-\s+(?=[\u0590-\u05FF])/g, ", ")
    .replace(/\s{2,}/g, " ")
    .replace(/,\s*,+/g, ", ")
    .replace(/,\s*([.!?])/g, "$1")
    .replace(/\s+([.!?])/g, "$1")
    .trim();
}

/** Primary spoken line for TTS — Hebrew when present, never the English gloss alone. */
export function tutorSpeechText(primary: string, translation?: string | null) {
  const main = prepareTextForTts(primary);
  if (/[\u0590-\u05FF]/.test(main)) return main;
  const gloss = prepareTextForTts(translation ?? "");
  return main || gloss;
}
