import type { Gender } from "@/lib/supabase/types";

export const INTEREST_HEBREW: Record<string, string> = {
  movies: "סרטים",
  movie: "סרטים",
  films: "סרטים",
  film: "סרטים",
  cars: "מכוניות",
  car: "מכוניות",
  travel: "טיולים",
  traveling: "טיולים",
  travelling: "טיולים",
  trips: "טיולים",
  sports: "ספורט",
  sport: "ספורט",
  tech: "טכנולוגיה",
  technology: "טכנולוגיה",
  gadgets: "גאדג'טים",
  music: "מוזיקה",
  food: "אוכל",
  cooking: "בישול",
  games: "משחקים",
  gaming: "משחקים",
  game: "משחקים",
};

const SLASH_FORMS: Array<{ re: RegExp; boy: string; girl: string; other: string }> = [
  { re: /אוהב\/ת/g, boy: "אוהב", girl: "אוהבת", other: "אוהב" },
  { re: /את\/ה/g, boy: "אתה", girl: "את", other: "אתה" },
  { re: /שמח\/ה/g, boy: "שמח", girl: "שמחה", other: "שמח" },
  { re: /יכול\/ה/g, boy: "יכול", girl: "יכולה", other: "יכול" },
  { re: /רוצה\/ה/g, boy: "רוצה", girl: "רוצה", other: "רוצה" },
  { re: /הלך\/ה/g, boy: "הלך", girl: "הלכה", other: "הלך" },
  { re: /אוהב\/ת/g, boy: "אוהב", girl: "אוהבת", other: "אוהב" },
  { re: /שלך\/ך/g, boy: "שלך", girl: "שלך", other: "שלך" },
];

export function translateInterest(topic: string | undefined | null) {
  if (!topic) return "";
  const key = topic.trim().toLowerCase();
  return INTEREST_HEBREW[key] || topic.trim();
}

export function hebrewGenderForms(gender: Gender | string | undefined) {
  if (gender === "girl") {
    return {
      you: "את",
      like: "אוהבת",
      can: "יכולה",
      want: "רוצה",
      went: "הלכת",
      your: "שלך",
    };
  }
  return {
    you: "אתה",
    like: "אוהב",
    can: "יכול",
    want: "רוצה",
    went: "הלכת",
    your: "שלך",
  };
}

export function polishHebrewTranslation(text: string, gender?: Gender | string | null) {
  if (!text) return text;
  const form = gender === "girl" ? "girl" : gender === "other" ? "other" : "boy";
  let next = text.trim();

  // Only normalize slash gender forms — never rewrite Latin tokens inside Hebrew
  // (that produced gibberish like "common less) ?אותך").
  for (const slash of SLASH_FORMS) {
    next = next.replace(slash.re, slash[form]);
  }

  return next.replace(/\s{2,}/g, " ").trim();
}

/** Reject mangled / partial subtitle strings. */
export function isCleanHebrewSubtitle(hebrew: string) {
  const he = hebrew.trim();
  if (!he || !/[\u0590-\u05FF]/.test(he)) return false;
  if (/[)\](]/.test(he) && /[A-Za-z]{2,}/.test(he)) return false;
  if (/\b(common|less|what|kind|ready|great|from)\b/i.test(he)) return false;
  // Require mostly Hebrew letters among letters present.
  const letters = he.match(/[\u0590-\u05FFa-zA-Z]/g) ?? [];
  if (letters.length === 0) return false;
  const hebrewLetters = (he.match(/[\u0590-\u05FF]/g) ?? []).length;
  return hebrewLetters / letters.length >= 0.55;
}

/** Exact / near-exact tutor phrases → instant Hebrew (no LLM). */
const QUICK_PHRASE_HE: Array<{
  re: RegExp;
  he: (g: ReturnType<typeof hebrewGenderForms>, match: RegExpMatchArray) => string;
}> = [
  { re: /^(hi|hello|hey)\b[!?.]*$/i, he: () => "היי!" },
  {
    re: /^(hi|hello|hey)[,!]?\s+([A-Za-z][A-Za-z'-]*)\b[!?.]*$/i,
    he: (_g, m) => `היי ${m[2] ?? ""}!`.trim(),
  },
  { re: /^good morning\b[!?.]*$/i, he: () => "בוקר טוב!" },
  { re: /^good afternoon\b[!?.]*$/i, he: () => "צהריים טובים!" },
  { re: /^good evening\b[!?.]*$/i, he: () => "ערב טוב!" },
  { re: /^how are you\??$/i, he: () => "מה שלומך?" },
  { re: /^what(?:'s| is) your name\??$/i, he: () => "איך קוראים לך?" },
  { re: /^nice to meet you[!?.]*$/i, he: () => "נעים להכיר!" },
  { re: /^let'?s (?:talk|chat|practice)\b.*$/i, he: () => "בואו נדבר!" },
  { re: /^great(?: job)?[!?.]*$/i, he: () => "כל הכבוד!" },
  { re: /^awesome[!?.]*$/i, he: () => "מדהים!" },
  { re: /^cool[!?.]*$/i, he: () => "מגניב!" },
  { re: /^yes[!?.]*$/i, he: () => "כן!" },
  { re: /^no[!?.]*$/i, he: () => "לא." },
  { re: /^thank you[!?.]*$/i, he: () => "תודה!" },
  { re: /^you'?re welcome[!?.]*$/i, he: () => "על לא דבר!" },
  { re: /^what do you (?:like|love)\??$/i, he: (g) => `מה ${g.you} ${g.like}?` },
  { re: /^what(?:'s| is) your favorite (?:color|colour)\??$/i, he: () => "מה הצבע האהוב עליך?" },
  {
    re: /^how old are you\??$/i,
    he: (g) => (g.you === "את" ? "בת כמה את?" : "בן כמה אתה?"),
  },
  { re: /^tell me more\b[!?.]*$/i, he: () => "ספר לי עוד!" },
  { re: /^can you say that again\??$/i, he: () => "אפשר לחזור על זה?" },
  { re: /^try again[!?.]*$/i, he: () => "בואו ננסה שוב!" },
  { re: /^well done[!?.]*$/i, he: () => "כל הכבוד!" },
  { re: /^i('m| am) (?:so )?happy to (?:see|meet) you[!?.]*$/i, he: () => "כיף לראות אותך!" },
  { re: /^what would you like to (?:talk|learn) about\??$/i, he: (g) => `על מה ${g.you} ${g.want} לדבר?` },
];

function normalizeForQuickTranslate(text: string) {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Instant local Hebrew for exact/near-exact tutor phrases only.
 * Does NOT word-swap free text (that produced broken subtitles).
 */
export function quickHebrewSubtitle(english: string, gender?: Gender | string | null): string {
  const raw = normalizeForQuickTranslate(english);
  if (!raw) return "";

  const g = hebrewGenderForms(gender ?? undefined);
  for (const entry of QUICK_PHRASE_HE) {
    const match = raw.match(entry.re);
    if (!match) continue;
    return polishHebrewTranslation(entry.he(g, match), gender);
  }
  return "";
}

/** Skip Gemini only when the phrase dictionary produced a clean match. */
export function shouldSkipLlmTranslate(_english: string, localHebrew: string) {
  return Boolean(localHebrew.trim());
}

export function hebrewTranslationGuide(gender?: Gender | string | null) {
  if (gender === "girl") {
    return `Use strictly feminine spoken Hebrew. Examples: את, את אוהבת, את יכולה, הלכת, אמרת. NEVER write slash forms like אוהב/ת or את/ה.`;
  }
  if (gender === "other") {
    return `Avoid slash forms like אוהב/ת or את/ה. Prefer gender-neutral phrasing (יש לך, אפשר, בואו נדבר). If a gendered verb is unavoidable, use standard masculine without slashes.`;
  }
  return `Use strictly masculine spoken Hebrew. Examples: אתה, אתה אוהב, אתה יכול, הלכת, אמרת. NEVER write slash forms like אוהב/ת or את/ה.`;
}

export function splitBidiRuns(text: string) {
  return text.split(/([A-Za-z][A-Za-z0-9'’.\-]*)/g).filter((part) => part.length > 0);
}

export function stripHebrewScript(text: string) {
  return text
    .replace(/[\u0590-\u05FF][\u0590-\u05FF\s.,!?׳״:'"()0-9-]*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractHebrewHint(text: string) {
  const match = text.match(/[\u0590-\u05FF][\u0590-\u05FF\s.,!?׳״:'"()0-9-]*(?::\s*[A-Za-z][A-Za-z0-9'’.,!? ]*)?/);
  return match?.[0]?.trim() ?? "";
}

export function splitCaptionLines(english: string, translation?: string | null) {
  const source = english.trim();
  const hebrewRaw = (translation ?? "").trim();
  // Never scrape English caption for Hebrew fragments — that yields broken subtitles.
  const hebrew = isCleanHebrewSubtitle(hebrewRaw) ? hebrewRaw : "";
  return {
    english: stripHebrewScript(source),
    hebrew,
  };
}
