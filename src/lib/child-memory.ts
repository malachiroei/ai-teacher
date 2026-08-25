import {
  EMPTY_CHILD_MEMORY,
  emptyChildMemory,
  weekdayName,
  type ChildMemoryProfile,
} from "@/types/childProfile";

export const CHILD_MEMORY_STORAGE_KEY = "buddyai_child_memory";

const DAY_ALIASES: Record<string, string> = {
  sunday: "Sunday",
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  ראשון: "Sunday",
  שני: "Monday",
  שלישי: "Tuesday",
  רביעי: "Wednesday",
  חמישי: "Thursday",
  שישי: "Friday",
  שבת: "Saturday",
};

const SUBJECTS: Record<string, string> = {
  math: "Math",
  maths: "Math",
  mathematics: "Math",
  מתמטיקה: "Math",
  חשבון: "Math",
  science: "Science",
  מדע: "Science",
  english: "English",
  אנגלית: "English",
  history: "History",
  היסטוריה: "History",
  hebrew: "Hebrew",
  עברית: "Hebrew",
  art: "Art",
  אומנות: "Art",
  music: "Music",
  מוזיקה: "Music",
  gym: "Gym",
  pe: "Gym",
  geography: "Geography",
};

const CLUBS = [
  "judo",
  "basketball",
  "soccer",
  "football",
  "dance",
  "swimming",
  "chess",
  "scouts",
  "karate",
  "ballet",
  "tennis",
  "robotics",
];

const HOBBIES = [
  "soccer",
  "lego",
  "drawing",
  "gaming",
  "basketball",
  "football",
  "minecraft",
  "roblox",
  "piano",
  "reading",
  "dancing",
  "swimming",
  "dinosaurs",
  "space",
];

function titleCase(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function unique(list: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const key = item.toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}

function storageKey(userId?: string | null) {
  return userId ? `${CHILD_MEMORY_STORAGE_KEY}:${userId}` : CHILD_MEMORY_STORAGE_KEY;
}

export function isChildMemoryProfile(value: unknown): value is ChildMemoryProfile {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ChildMemoryProfile>;
  return Array.isArray(row.hobbies) && Array.isArray(row.afterSchoolClubs) && Array.isArray(row.schoolSchedule);
}

export function parseChildMemory(raw: unknown): ChildMemoryProfile {
  if (!raw) return emptyChildMemory();
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch {
      return emptyChildMemory();
    }
  }
  if (!isChildMemoryProfile(value)) return emptyChildMemory();
  return {
    name: value.name?.trim() || undefined,
    age: Number(value.age) > 0 ? Number(value.age) : undefined,
    gradeLevel: value.gradeLevel?.trim() || undefined,
    hobbies: unique(value.hobbies.map(String)),
    afterSchoolClubs: value.afterSchoolClubs
      .filter((item) => item?.day && item?.activity)
      .map((item) => ({ day: titleCase(String(item.day)), activity: titleCase(String(item.activity)) })),
    schoolSchedule: value.schoolSchedule
      .filter((item) => item?.day && Array.isArray(item.subjects))
      .map((item) => ({
        day: titleCase(String(item.day)),
        subjects: unique(item.subjects.map(String)),
      })),
    learningInterests: unique((value.learningInterests ?? []).map(String)),
    mathSkillLevel: value.mathSkillLevel,
    recentTopicsLearned: (value.recentTopicsLearned ?? []).slice(0, 16),
    updatedAt: value.updatedAt,
  };
}

export function mergeChildMemory(base: ChildMemoryProfile, patch: Partial<ChildMemoryProfile>): ChildMemoryProfile {
  const clubs = [...base.afterSchoolClubs];
  for (const club of patch.afterSchoolClubs ?? []) {
    const idx = clubs.findIndex((item) => item.day.toLowerCase() === club.day.toLowerCase());
    if (idx >= 0) clubs[idx] = club;
    else clubs.push(club);
  }
  const schedule = [...base.schoolSchedule];
  for (const day of patch.schoolSchedule ?? []) {
    const idx = schedule.findIndex((item) => item.day.toLowerCase() === day.day.toLowerCase());
    if (idx >= 0) {
      schedule[idx] = { ...schedule[idx], subjects: unique([...schedule[idx].subjects, ...day.subjects]) };
    } else schedule.push(day);
  }
  return {
    name: patch.name?.trim() || base.name,
    age: patch.age && patch.age > 0 ? patch.age : base.age,
    gradeLevel: patch.gradeLevel?.trim() || base.gradeLevel,
    hobbies: unique([...(base.hobbies ?? []), ...(patch.hobbies ?? [])]),
    afterSchoolClubs: clubs,
    schoolSchedule: schedule,
    learningInterests: unique([...(base.learningInterests ?? []), ...(patch.learningInterests ?? [])]),
    mathSkillLevel: patch.mathSkillLevel || base.mathSkillLevel,
    recentTopicsLearned: [...(patch.recentTopicsLearned ?? []), ...(base.recentTopicsLearned ?? [])].slice(0, 16),
    updatedAt: new Date().toISOString(),
  };
}

function detectDay(text: string) {
  const lower = text.toLowerCase();
  if (/\btoday\b|היום/.test(lower)) return weekdayName();
  for (const [alias, day] of Object.entries(DAY_ALIASES)) {
    if (new RegExp(`\\b${alias}s?\\b`, "i").test(lower) || lower.includes(alias)) return day;
  }
  return null;
}

function detectSubject(text: string) {
  const lower = text.toLowerCase();
  for (const [alias, subject] of Object.entries(SUBJECTS)) {
    if (new RegExp(`\\b${alias}\\b`, "i").test(lower) || lower.includes(alias)) return subject;
  }
  return null;
}

export function extractChildMemoryPatch(text: string, now = new Date()): Partial<ChildMemoryProfile> {
  const spoken = String(text || "").replace(/\s+/g, " ").trim();
  if (spoken.length < 3) return {};
  const lower = spoken.toLowerCase();
  const patch: Partial<ChildMemoryProfile> = {
    hobbies: [],
    afterSchoolClubs: [],
    schoolSchedule: [],
    learningInterests: [],
    recentTopicsLearned: [],
  };
  const today = now.toISOString().slice(0, 10);
  const day = detectDay(spoken);

  const grade = spoken.match(/\b(\d+)(?:st|nd|rd|th)?\s*grade\b/i) || spoken.match(/\bgrade\s*(\d+)\b/i);
  if (grade?.[1]) patch.gradeLevel = `${grade[1]}${grade[1] === "1" ? "st" : grade[1] === "2" ? "nd" : grade[1] === "3" ? "rd" : "th"} grade`;
  const age = spoken.match(/\b(?:i'?m|i am|age)\s*([6-9]|1[0-3])\b/i);
  if (age) patch.age = Number(age[1]);

  for (const hobby of HOBBIES) {
    if (new RegExp(`\\b${hobby}\\b`, "i").test(lower) && /like|love|play|hobby|אוהב|אוהבת/.test(lower)) {
      patch.hobbies!.push(titleCase(hobby));
    }
  }

  for (const club of CLUBS) {
    if (!new RegExp(`\\b${club}\\b`, "i").test(lower)) continue;
    if (/after school|club|go to|on \w+days?|i have|lesson/i.test(lower) || day) {
      patch.afterSchoolClubs!.push({ day: day || weekdayName(now), activity: titleCase(club) });
      patch.hobbies!.push(titleCase(club));
    }
  }

  const subject = detectSubject(spoken);
  if (subject && (/class|today|learned|lesson|school|שיעור|למדנו|היה לי/.test(lower) || day)) {
    patch.schoolSchedule!.push({ day: day || weekdayName(now), subjects: [subject] });
  }

  if (/\btimes\b|x\s*\d|multiplication|כפל|פעמים/.test(lower)) {
    patch.mathSkillLevel = "multiplication";
    patch.learningInterests!.push("multiplication");
    const times = spoken.match(/(\d+)\s*(?:times|x)\s*(\d+)/i);
    patch.recentTopicsLearned!.push({
      subject: "Math",
      topic: times ? `${times[1]}×${times[2]}` : "times tables",
      date: today,
    });
    if (!patch.schoolSchedule!.length) {
      patch.schoolSchedule!.push({ day: day || weekdayName(now), subjects: ["Math"] });
    }
  } else if (/\bfraction|חצי|רבע/.test(lower)) {
    patch.mathSkillLevel = "fractions";
    patch.learningInterests!.push("fractions");
    patch.recentTopicsLearned!.push({ subject: "Math", topic: "fractions", date: today });
  } else if (/\bplus\b|\badd(?:ition)?\b|חיבור/.test(lower)) {
    patch.mathSkillLevel = patch.mathSkillLevel || "basic_addition";
    patch.recentTopicsLearned!.push({ subject: "Math", topic: "addition", date: today });
  }

  if (/\bdinosaur/.test(lower)) patch.learningInterests!.push("dinosaurs");
  if (/\bspace|planet|rocket/.test(lower)) patch.learningInterests!.push("space");

  if (!patch.hobbies?.length) delete patch.hobbies;
  if (!patch.afterSchoolClubs?.length) delete patch.afterSchoolClubs;
  if (!patch.schoolSchedule?.length) delete patch.schoolSchedule;
  if (!patch.learningInterests?.length) delete patch.learningInterests;
  if (!patch.recentTopicsLearned?.length) delete patch.recentTopicsLearned;
  return patch;
}

export function looksLikeMathTalk(text: string) {
  return /\bmath|times tables|\d+\s*(times|x|\+)\s*\d+|multiplication|fraction|plus|חיבור|כפל|מתמטיקה|חשבון/i.test(
    text,
  );
}

export function loadChildMemoryLocal(userId?: string | null): ChildMemoryProfile {
  if (typeof window === "undefined") return emptyChildMemory();
  try {
    const scoped = userId ? window.localStorage.getItem(storageKey(userId)) : null;
    const shared = window.localStorage.getItem(CHILD_MEMORY_STORAGE_KEY);
    return parseChildMemory(scoped || shared);
  } catch {
    return emptyChildMemory();
  }
}

export function saveChildMemoryLocal(profile: ChildMemoryProfile, userId?: string | null) {
  if (typeof window === "undefined") return;
  const payload = JSON.stringify({ ...profile, updatedAt: new Date().toISOString() });
  try {
    window.localStorage.setItem(CHILD_MEMORY_STORAGE_KEY, payload);
    if (userId) window.localStorage.setItem(storageKey(userId), payload);
  } catch {
    /* ignore quota */
  }
}

export function seedChildMemoryFromAccount(profile: {
  nickname?: string | null;
  age?: number | string | null;
  interests?: string[] | string | null;
}): Partial<ChildMemoryProfile> {
  const interests = Array.isArray(profile.interests)
    ? profile.interests
    : String(profile.interests ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return {
    name: String(profile.nickname ?? "").trim() || undefined,
    age: Number(profile.age) > 0 ? Number(profile.age) : undefined,
    hobbies: interests,
    learningInterests: interests,
  };
}

export { EMPTY_CHILD_MEMORY, emptyChildMemory, weekdayName };
