export type MemoryKind = "plan" | "event" | "preference" | "personal";

export interface UserMemory {
  id: string;
  fact: string;
  kind: MemoryKind;
  eventOn?: string | null;
  createdAt: number;
}

export interface NewMemory {
  fact: string;
  kind: MemoryKind;
  eventOn?: string | null;
}

const KINDS: MemoryKind[] = ["plan", "event", "preference", "personal"];

const AGE_WORDS: Record<string, number> = {
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
};

export function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && KINDS.includes(value as MemoryKind);
}

export function mapMemoryCategory(category: string): MemoryKind {
  const value = category.toLowerCase().trim();
  if (["plan", "tomorrow", "later", "tonight"].includes(value)) return "plan";
  if (["event", "sport", "sports", "school", "game-event"].includes(value)) return "event";
  if (["preference", "favorite", "hobby", "animal", "food", "game", "color", "pet"].includes(value)) {
    return "preference";
  }
  return "personal";
}

export function normalizeFactText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 180);
}

export function normalizeNewMemories(value: unknown): NewMemory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const memories: NewMemory[] = [];
  for (const item of value) {
    const row = item as Partial<NewMemory> & { text?: string; category?: string };
    const fact = normalizeFactText(String(row.fact || row.text || ""));
    if (fact.length < 4) continue;
    const key = fact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    memories.push({
      fact,
      kind: isMemoryKind(row.kind) ? row.kind : mapMemoryCategory(String(row.category || "personal")),
      eventOn: row.eventOn ? String(row.eventOn).slice(0, 10) : null,
    });
  }
  return memories.slice(0, 6);
}

export function parseSpokenAge(text: string): number | null {
  const lower = text.toLowerCase();
  const digit = lower.match(/\b([6-9]|1[0-3])\b/);
  if (digit) return Number(digit[1]);
  for (const [word, age] of Object.entries(AGE_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(lower)) return age;
  }
  return null;
}

export function parseFavoriteAnimal(text: string): string | null {
  const lower = text.toLowerCase();
  if (/both|גם וגם/.test(lower)) return "dogs and cats";
  if (/dog|puppy|כלב/.test(lower)) return "dogs";
  if (/cat|kitten|חתול/.test(lower)) return "cats";
  return null;
}

export function parseFavoriteThing(text: string): string | null {
  const animal = parseFavoriteAnimal(text);
  if (animal) return animal;
  const cleaned = text.replace(/[.!?]/g, " ").replace(/\s+/g, " ").trim();
  const named = cleaned.match(
    /(?:i like|i love|my favorite is|favorite is|אוהב|אוהבת)\s+(.{2,40})$/i,
  );
  if (named?.[1]) return named[1].trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.length <= 6 && !/^(yes|no|ok|okay|um+|uh+)$/i.test(cleaned)) {
    return cleaned;
  }
  return null;
}

function tomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function extractFactsFromUtterance(
  text: string,
  extras?: { placementTurn?: number; childName?: string },
): NewMemory[] {
  const spoken = normalizeFactText(text);
  if (!spoken) return [];
  const lower = spoken.toLowerCase();
  const found: NewMemory[] = [];
  const add = (fact: string, kind: MemoryKind, eventOn: string | null = null) => {
    const next = normalizeFactText(fact);
    if (next.length < 4) return;
    if (found.some((item) => item.fact.toLowerCase() === next.toLowerCase())) return;
    found.push({ fact: next, kind, eventOn });
  };

  if (extras?.placementTurn === 1) {
    const name = extras.childName?.trim();
    if (name) add(`Child's name is ${name}`, "personal");
  }
  if (extras?.placementTurn === 2) {
    const age = parseSpokenAge(spoken);
    if (age) add(`Age is ${age}`, "personal");
  }
  if (extras?.placementTurn === 3) {
    const thing = parseFavoriteThing(spoken);
    if (thing) add(`Likes ${thing}`, "preference");
  }

  const age = parseSpokenAge(spoken);
  if (age && extras?.placementTurn !== 2) add(`Age is ${age}`, "personal");

  const animal = parseFavoriteAnimal(spoken);
  if (animal && extras?.placementTurn !== 3) add(`Likes ${animal}`, "preference");

  const favorite = spoken.match(/favorite\s+(?:color|game|food|animal|sport)?\s*(?:is|:)?\s*([a-z\u0590-\u05FF]{2,20})/i);
  if (favorite?.[1]) add(`Favorite thing is ${favorite[1]}`, "preference");

  if (/\b(roblox|minecraft|fortnite|fifa)\b/i.test(spoken)) {
    const game = spoken.match(/\b(roblox|minecraft|fortnite|fifa)\b/i)?.[1];
    if (game) add(`Likes playing ${game}`, "preference");
  }

  if (/\b(pizza|pasta|ice cream|chocolate|burger)\b/i.test(lower)) {
    const food = lower.match(/\b(pizza|pasta|ice cream|chocolate|burger)\b/)?.[1];
    if (food) add(`Likes ${food}`, "preference");
  }

  const gradeEn = spoken.match(/\b(\d+)(?:st|nd|rd|th)?\s*grade\b/i) || spoken.match(/\bgrade\s*(\d+)\b/i);
  if (gradeEn?.[1]) add(`In grade ${gradeEn[1]}`, "personal");
  const gradeHe = spoken.match(/כיתה\s*([א-ו1-9])/);
  if (gradeHe?.[1]) add(`In grade ${gradeHe[1]}`, "personal");

  if (/\b(soccer|football|basketball|swimming|tennis)\b/i.test(lower) || /כדורגל/.test(spoken)) {
    const sport = /כדורגל/.test(spoken)
      ? "football"
      : lower.match(/\b(soccer|football|basketball|swimming|tennis)\b/i)?.[1];
    if (sport) add(`Plays ${sport}`, "preference");
  }

  const friend = spoken.match(/\b(?:my friend|friend)\s+([A-Za-z\u0590-\u05FF]{2,20})/i);
  if (friend?.[1]) add(`Friend named ${friend[1]}`, "personal");

  if (/\b(happy|excited|שמח|שמחה)\b/i.test(lower)) add("Feeling happy today", "personal");
  if (/\b(sad|עצוב|עצובה)\b/i.test(lower)) add("Feeling a bit sad", "personal");
  if (/\b(tired|עייף|עייפה)\b/i.test(lower)) add("Feeling tired today", "personal");

  if (/\b(tomorrow|tonight|later|מחר|הערב)\b/i.test(lower) || /\b(i will|i'm going|going to)\b/i.test(lower)) {
    add(`Plan: ${spoken}`, "plan", /\btomorrow|מחר\b/i.test(lower) ? tomorrowDate() : null);
  }

  if (/\b(puppy|dog|cat|pet|hamster|fish)\b/i.test(lower) && /my|יש לי|של/.test(lower)) {
    add(`Has a pet: ${spoken}`, "preference");
  }

  return found.slice(0, 4);
}

export function formatMemoriesForPrompt(memories: UserMemory[]) {
  if (memories.length === 0) return "";
  const lines = memories
    .slice(0, 40)
    .map((memory) => {
      const when = memory.eventOn ? ` (date: ${memory.eventOn})` : "";
      return `- [${memory.kind}] ${memory.fact}${when}`;
    })
    .join("\n");
  return lines;
}

export function formatUserProfileBlock(
  profile?: {
    nickname?: string | null;
    name?: string | null;
    age?: number | string | null;
    english_level?: string | null;
    englishLevel?: string | null;
    daily_goal_minutes?: number | null;
    dailyGoalMinutes?: number | null;
    native_language?: string | null;
    interests?: string[] | string | null;
  } | null,
  memories: UserMemory[] = [],
) {
  const name = String(profile?.nickname || profile?.name || "").trim() || "friend";
  const age = Number(profile?.age);
  const gradeFact = memories.find((memory) => /grade|כיתה/i.test(memory.fact))?.fact;
  const ageFact = memories.find((memory) => /^Age is /i.test(memory.fact))?.fact;
  const ageGrade = [Number.isFinite(age) && age > 0 ? `Age ${age}` : "", gradeFact || ageFact || ""]
    .filter(Boolean)
    .join(" / ") || "unknown";
  const interests = Array.isArray(profile?.interests)
    ? profile.interests.filter(Boolean).join(", ")
    : String(profile?.interests ?? "").trim();
  const hobbyFacts = memories
    .filter((memory) => memory.kind === "preference" || /like|play|love|hobby/i.test(memory.fact))
    .map((memory) => memory.fact)
    .slice(0, 12);
  const hobbies = [...new Set([interests, ...hobbyFacts].filter(Boolean))].join("; ") || "none stored yet";
  const facts = formatMemoriesForPrompt(memories);
  const level = String(profile?.english_level ?? profile?.englishLevel ?? "").trim() || "beginner";
  const targetDaily = Number(profile?.daily_goal_minutes ?? profile?.dailyGoalMinutes ?? 10) || 10;
  const nativeLanguage = String(profile?.native_language ?? "").trim();

  return `### USER PROFILE & MEMORIES
Child Name: ${name}
Child Age / Grade: ${ageGrade}
English Comfort Level: ${level}
Known Interests & Hobbies: ${hobbies}
Target Daily Practice: ${targetDaily} min/day${nativeLanguage ? ` (native language: ${nativeLanguage})` : ""}
${facts ? `Stored facts:\n${facts}` : "No extra facts stored yet."}

When asked about past facts, age, grade, or preferences, consult the USER PROFILE & MEMORIES section above. Answer accurately, warmly, and directly (e.g., "Of course! You're in 9th grade and you love basketball — would you rather dunk or hit a buzzer-beater?"). Use their name sparingly. Never say you do not remember if the fact is listed here.`;
}
