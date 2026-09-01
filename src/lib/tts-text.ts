import type { NeuralTtsVoice } from "@/lib/tts-voices";

export type TtsLang = "he" | "en";

export type SpeechQueueSegment = {
  /** Full tutor line shown in the UI while this chunk plays. */
  display: string;
  /** Text sent to TTS for this chunk only. */
  spoken: string;
  lang: TtsLang;
  voice?: NeuralTtsVoice;
};

const HEBREW = /[\u0590-\u05FF]/;

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

function mergeAdjacentSegments(segments: Array<{ text: string; lang: TtsLang }>) {
  const out: Array<{ text: string; lang: TtsLang }> = [];
  for (const seg of segments) {
    const last = out[out.length - 1];
    if (last && last.lang === seg.lang) {
      last.text = `${last.text} ${seg.text}`.replace(/\s+/g, " ").trim();
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

/** Split mixed Hebrew/English into voice-appropriate TTS chunks. */
export function splitTtsSegments(text: string): Array<{ text: string; lang: TtsLang }> {
  const cleaned = prepareTextForTts(text);
  if (!cleaned) return [];

  const hasHe = HEBREW.test(cleaned);
  const hasEn = /[A-Za-z]/.test(cleaned);
  if (!hasHe || !hasEn) {
    return [{ text: cleaned, lang: hasHe ? "he" : "en" }];
  }

  const parts = cleaned.split(/((?:[A-Za-z][A-Za-z0-9'’.\-]*)(?:\s+[A-Za-z][A-Za-z0-9'’.\-]*)*)/g).filter((p) => p.trim());
  const segments: Array<{ text: string; lang: TtsLang }> = [];

  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    if (/^[A-Za-z]/.test(t) && !HEBREW.test(t)) {
      segments.push({ text: t, lang: "en" });
    } else if (HEBREW.test(t)) {
      segments.push({ text: t, lang: "he" });
    }
  }

  return mergeAdjacentSegments(segments);
}

/** Expand one tutor line into ordered TTS queue segments (Hebrew voice + English voice). */
export function expandTextToSpeechQueue(text: string): SpeechQueueSegment[] {
  const display = text.trim();
  if (!display) return [];

  const segments = splitTtsSegments(display);
  if (segments.length === 0) return [];

  return segments.map((seg) => ({
    display,
    spoken: seg.text,
    lang: seg.lang,
  }));
}

/** Primary spoken line for TTS — Hebrew when present, never the English gloss alone. */
export function tutorSpeechText(primary: string, translation?: string | null) {
  const main = prepareTextForTts(primary);
  if (HEBREW.test(main)) return main;
  const gloss = prepareTextForTts(translation ?? "");
  return main || gloss;
}

/** True when text needs split Hebrew/English neural voices. */
export function needsBilingualTts(text: string) {
  const cleaned = prepareTextForTts(text);
  return HEBREW.test(cleaned) && /[A-Za-z]/.test(cleaned);
}
