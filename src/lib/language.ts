export type UserLanguage = "he" | "en";
export type SpeechLang = "en-US" | "he-IL";

const HEBREW_LETTER = /[\u0590-\u05FF]/;
const HEBREW_GLOBAL = /[\u0590-\u05FF]/g;
const LATIN_GLOBAL = /[A-Za-z]/g;

const ENGLISH_FUNCTION_WORDS = new Set([
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "it",
  "a",
  "an",
  "the",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "and",
  "or",
  "but",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "my",
  "your",
  "me",
  "that",
  "this",
  "with",
  "not",
  "no",
  "yes",
  "how",
  "what",
  "where",
  "when",
  "why",
  "can",
  "will",
  "like",
  "love",
  "want",
  "go",
  "going",
  "good",
  "hi",
  "hello",
  "thanks",
  "thank",
  "please",
  "today",
  "really",
]);

export function hasHebrewScript(text: string) {
  return HEBREW_LETTER.test(text);
}

export function detectUserLanguage(text: string): UserLanguage {
  const hebrew = (text.match(HEBREW_GLOBAL) ?? []).length;
  const latin = (text.match(LATIN_GLOBAL) ?? []).length;
  if (hebrew === 0) return "en";
  if (latin === 0) return "he";
  return hebrew >= latin * 0.5 ? "he" : "en";
}

export function englishWordRatio(text: string) {
  const words = tokenizeEnglish(text);
  if (words.length === 0) return 0;
  const hits = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word) || word.length >= 5).length;
  return hits / words.length;
}

export function looksLikeGibberishEnglish(text: string) {
  if (hasHebrewScript(text)) return false;
  const words = tokenizeEnglish(text);
  if (words.length === 0) return true;
  if (words.length >= 3) {
    const functionHits = words.filter((word) => ENGLISH_FUNCTION_WORDS.has(word)).length;
    if (functionHits === 0) return true;
  }
  return englishWordRatio(text) < 0.3 && words.length >= 2;
}

export function looksLikeAwkwardEnglish(text: string) {
  const trimmed = text.trim();
  if (!trimmed || hasHebrewScript(trimmed)) return false;
  if (/^(i am|i'm|i|me|yes i|i want|i go|i like|am fine)\.?$/i.test(trimmed)) return true;
  return looksLikeGibberishEnglish(trimmed);
}

export function inferBrowserSpeechLang(): SpeechLang {
  if (typeof navigator === "undefined") return "en-US";
  const langs = [...(navigator.languages ?? []), navigator.language]
    .filter(Boolean)
    .map((lang) => lang.toLowerCase());
  if (langs.some((lang) => lang.startsWith("he") || lang.startsWith("iw"))) return "he-IL";
  return "en-US";
}

export function preferredSpeechLangFromText(text: string): SpeechLang | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return detectUserLanguage(trimmed) === "he" ? "he-IL" : "en-US";
}

function tokenizeEnglish(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z'\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}
