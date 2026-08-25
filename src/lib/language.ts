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

function stripGreetingDecorations(text: string) {
  return text
    .trim()
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[!?.,…~❤️\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSimpleGreeting(text: string) {
  const t = stripGreetingDecorations(text);
  if (!t) return false;
  return /^(hi+|hii+|hey+|hello+|yo+|sup|howdy)( there| guys| everybody| everyone)?$/i.test(t)
    || /^(שלום|שלום רב|היי+|הי+|הללו|בוקר טוב|ערב טוב|צהריים טובים|מה נשמע)$/.test(t);
}

export function askedForPhraseHelp(text: string) {
  return /how do i say|how can i say|how to say|what(?:'| i)?s the english|איך אומרים|איך אומר|איך להגיד/i.test(
    text.trim(),
  );
}

export function shouldOfferSayHint(text: string) {
  if (askedForPhraseHelp(text)) return true;
  if (isSimpleGreeting(text)) return false;
  return looksLikeAwkwardEnglish(text) || looksLikeGibberishEnglish(text);
}

export function normalizeSpeechKey(text: string) {
  return text
    .toLowerCase()
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function englishSpeechLine(text: string) {
  return String(text || "")
    .replace(/<<<GAME:\s*\{[\s\S]*?\}\s*>>>/gi, " ")
    .replace(/[\u0590-\u05FF][\u0590-\u05FF\s,.'’"!?-]*/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\uFE0F\u200D\u20E3]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function stripUnsolicitedScaffold(text: string) {
  return text
    .replace(/(?:^|\s)(?:in english,?\s*)?you can say:\s*["']?[^"'\n]*["']?\s*/gi, " ")
    .replace(/\s*בואי ננסה:\s*[^\n]*?(?=[.!?]|[\u0590-\u05FF]|$)/g, " ")
    .replace(/\s*באנגלית אפשר להגיד:\s*[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseDoubledPhrase(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 4) return text;
  for (let n = Math.floor(words.length / 2); n >= 2; n -= 1) {
    const a = normalizeSpeechKey(words.slice(0, n).join(" "));
    const b = normalizeSpeechKey(words.slice(n, n * 2).join(" "));
    if (a && a === b) {
      const rest = words.slice(n * 2);
      const head = words.slice(0, n).join(" ");
      return rest.length ? `${head} ${collapseDoubledPhrase(rest.join(" "))}` : head;
    }
  }
  return text;
}

function splitSpeakableSentences(text: string) {
  const out: string[] = [];
  const pattern = /[^.!?…]+(?:[.!?…]["')\]]*)?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const piece = match[0].trim();
    if (piece) out.push(piece);
  }
  return out.length > 0 ? out : text.trim() ? [text.trim()] : [];
}

export function collapseRepeatedSpeech(text: string) {
  if (!text) return "";
  let next = text.replace(/\s+/g, " ").trim();
  next = next.replace(/\b([\p{L}'’]+)(?:\s+\1\b)+/giu, "$1");

  const unique: string[] = [];
  for (const sentence of splitSpeakableSentences(next)) {
    const key = normalizeSpeechKey(sentence);
    if (key && unique.some((prev) => normalizeSpeechKey(prev) === key)) continue;
    unique.push(sentence);
  }
  next = unique.join(" ");
  return collapseDoubledPhrase(next).replace(/\s+/g, " ").trim();
}

export function isRedundantSpeechChunk(chunk: string, spoken: string) {
  const a = normalizeSpeechKey(chunk);
  if (!a) return true;
  const b = normalizeSpeechKey(spoken);
  if (!b) return false;
  if (a === b) return true;
  return b.includes(a);
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
