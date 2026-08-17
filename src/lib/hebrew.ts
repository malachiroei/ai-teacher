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
  let next = text;

  for (const slash of SLASH_FORMS) {
    next = next.replace(slash.re, slash[form]);
  }

  next = next.replace(/\b[A-Za-z][A-Za-z']*\b/g, (word) => {
    const translated = INTEREST_HEBREW[word.toLowerCase()];
    return translated || word;
  });

  return next.replace(/\s{2,}/g, " ").trim();
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
  const hebrew = (translation ?? "").trim() || extractHebrewHint(source);
  return {
    english: stripHebrewScript(source),
    hebrew,
  };
}
