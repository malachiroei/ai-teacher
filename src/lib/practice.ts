import type { Character, CharacterId } from "@/lib/characters";
import type { DailyGoalMinutes, Gender, Profile } from "@/lib/supabase/types";
import type { Message } from "@/types/chat";

export const DAILY_GOAL_OPTIONS = [5, 10, 15, 20] as const;
export const VOICE_SPEED_OPTIONS = [0.75, 0.9, 1.1] as const;
export const DEFAULT_DAILY_GOAL: DailyGoalMinutes = 10;
export const DEFAULT_PRACTICE_TIME = "17:00";
export const DEFAULT_VOICE_SPEED: VoiceSpeed = 0.9;
export const VOICE_SPEED_STORAGE_KEY = "voice_speed";

export interface PracticeSnapshot {
  date: string;
  seconds: number;
  celebrated: boolean;
}

export type VoiceSpeed = 0.75 | 0.9 | 1.1;

export interface PracticeSettings {
  daily_goal_minutes: DailyGoalMinutes;
  preferred_practice_time: string;
  notifications_enabled: boolean;
  parent_whatsapp: string;
  voice_speed: VoiceSpeed;
  preferred_voice: string;
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "to",
  "of",
  "in",
  "on",
  "at",
  "for",
  "is",
  "am",
  "are",
  "was",
  "were",
  "be",
  "i",
  "you",
  "he",
  "she",
  "we",
  "they",
  "it",
  "my",
  "me",
  "your",
  "this",
  "that",
  "with",
  "have",
  "has",
  "had",
  "do",
  "did",
  "not",
  "so",
  "just",
  "like",
  "very",
  "really",
  "today",
  "hello",
  "hi",
  "hey",
  "yes",
  "yeah",
  "no",
  "ok",
  "okay",
  "please",
  "thanks",
  "thank",
]);

const GOAL_CHEERS: Partial<Record<CharacterId, string>> & Record<"emma", string> = {
  emma: "Amazing job! You crushed your {{minutes}} minutes today! 🎉",
  alex: "Champion session — {{minutes}} minutes on the clock! 🏆",
  leo: "Mission complete — {{minutes}} minutes of English in orbit! 🚀",
  maya: "Beautiful set — {{minutes}} minutes of English, like a song! 🎵",
  kai: "Trail done — {{minutes}} minutes of English adventure! 🌍",
  chloe: "GG — {{minutes}} minutes, and you leveled up English! 🎮",
};

export function todayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function startOfLocalDay(date = new Date()) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next.getTime();
}

export function normalizeDailyGoal(value: unknown): DailyGoalMinutes {
  const n = Number(value);
  return (DAILY_GOAL_OPTIONS as readonly number[]).includes(n) ? (n as DailyGoalMinutes) : DEFAULT_DAILY_GOAL;
}

export function normalizePracticeTime(value: unknown) {
  const text = String(value ?? "").trim();
  return /^\d{2}:\d{2}$/.test(text) ? text : DEFAULT_PRACTICE_TIME;
}

export function normalizeVoiceSpeed(value: unknown): VoiceSpeed {
  const n = Number(value);
  if (n === 0.75 || n === 0.9 || n === 1.1) return n;
  if (n <= 0.8) return 0.75;
  if (n >= 1.05) return 1.1;
  return DEFAULT_VOICE_SPEED;
}

export function voiceSpeedLabel(speed: VoiceSpeed) {
  if (speed === 0.75) return "Slow 0.75x";
  if (speed === 1.1) return "Fast 1.1x";
  return "Normal 0.9x";
}

export function formatVoiceSpeed(speed: VoiceSpeed) {
  if (speed === 0.75) return "0.75x";
  if (speed === 1.1) return "1.1x";
  return "0.9x";
}

export function nextVoiceSpeed(speed: VoiceSpeed): VoiceSpeed {
  const index = VOICE_SPEED_OPTIONS.indexOf(speed);
  return VOICE_SPEED_OPTIONS[(index + 1) % VOICE_SPEED_OPTIONS.length] ?? DEFAULT_VOICE_SPEED;
}

export function readStoredVoiceSpeed(fallback?: unknown): VoiceSpeed {
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(VOICE_SPEED_STORAGE_KEY);
      if (raw != null && raw !== "") return normalizeVoiceSpeed(raw);
    } catch {
      /* private mode */
    }
  }
  return normalizeVoiceSpeed(fallback);
}

export function writeStoredVoiceSpeed(speed: VoiceSpeed) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOICE_SPEED_STORAGE_KEY, String(speed));
  } catch {
    /* ignore quota / private mode */
  }
}

export function practiceSettingsFromProfile(profile?: Profile | null): PracticeSettings {
  return {
    daily_goal_minutes: normalizeDailyGoal(profile?.daily_goal_minutes),
    preferred_practice_time: normalizePracticeTime(profile?.preferred_practice_time),
    notifications_enabled: Boolean(profile?.notifications_enabled),
    parent_whatsapp: String(profile?.parent_whatsapp ?? "").trim(),
    voice_speed: normalizeVoiceSpeed(profile?.voice_speed),
    preferred_voice: String(profile?.preferred_voice ?? "").trim(),
  };
}

export function storageKey(userId: string) {
  return `ai-teacher:practice:${userId}`;
}

export function loadPracticeSnapshot(userId: string): PracticeSnapshot {
  const empty: PracticeSnapshot = { date: todayDateKey(), seconds: 0, celebrated: false };
  if (typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as PracticeSnapshot;
    if (parsed.date !== todayDateKey()) return empty;
    return {
      date: parsed.date,
      seconds: Math.max(0, Number(parsed.seconds) || 0),
      celebrated: Boolean(parsed.celebrated),
    };
  } catch {
    return empty;
  }
}

export function savePracticeSnapshot(userId: string, snapshot: PracticeSnapshot) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch {
    /* quota / private mode */
  }
}

export function mergePracticeSeconds(localSeconds: number, profile?: Profile | null) {
  if (!profile?.practice_date) return localSeconds;
  const profileDate = String(profile.practice_date).slice(0, 10);
  if (profileDate !== todayDateKey()) return localSeconds;
  return Math.max(localSeconds, Number(profile.practice_seconds) || 0);
}

export function practicedMinutes(seconds: number) {
  return Math.floor(seconds / 60);
}

export function goalCheer(character: Character, minutes: number) {
  const template = GOAL_CHEERS[character.id] ?? GOAL_CHEERS.emma;
  return template.replaceAll("{{minutes}}", String(minutes));
}

export function countUserMessagesToday(messages: Message[]) {
  const start = startOfLocalDay();
  return messages.filter((message) => message.sender === "user" && message.timestamp >= start).length;
}

export function extractPracticeTopics(messages: Message[], fallbackInterests: string[] = []) {
  const start = startOfLocalDay();
  const today = messages.filter((message) => message.timestamp >= start);
  const scores = new Map<string, number>();

  function add(raw: string, weight: number) {
    const word = raw.toLowerCase().replace(/[^a-z'-]/g, "");
    if (word.length < 4 || STOP_WORDS.has(word)) return;
    scores.set(word, (scores.get(word) ?? 0) + weight);
  }

  for (const message of today) {
    if (message.sender === "user") {
      for (const token of message.text.split(/\s+/)) add(token, 2);
      if (message.grammarFeedback?.hasError && message.grammarFeedback.correctedText) {
        for (const token of message.grammarFeedback.correctedText.split(/\s+/)) add(token, 3);
      }
    }
  }

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 3);

  if (ranked.length > 0) {
    return ranked.map((word) => word.charAt(0).toUpperCase() + word.slice(1));
  }

  return fallbackInterests.slice(0, 3);
}

export function normalizeWhatsAppPhone(raw: string) {
  let digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (digits.startsWith("0") && digits.length >= 9) digits = `972${digits.slice(1)}`;
  return digits.replace(/\D/g, "");
}

export function finishedVerb(gender?: Gender | string | null) {
  if (gender === "girl") return "סיימה";
  if (gender === "other") return "סיים";
  return "סיים";
}

export function buildParentWhatsAppMessage(input: {
  childName: string;
  gender?: Gender | string | null;
  minutes: number;
  characterName: string;
  topics: string[];
}) {
  const name = input.childName.trim() || "הילד/ה";
  const topics = input.topics.length > 0 ? input.topics.join(", ") : "שיחה חופשית באנגלית";
  return [
    `היי! 🌟 ${name} ${finishedVerb(input.gender)} עכשיו בהצלחה ${input.minutes} דקות של אימון אנגלית עם ${input.characterName} ב-BuddyAI!`,
    `נושאי השיחה היום: ${topics}`,
    "כל הכבוד על ההתמדה! 👏",
  ].join("\n");
}

export function whatsappShareUrl(phone: string, text: string) {
  const digits = normalizeWhatsAppPhone(phone);
  if (!digits) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function msUntilTime(hhmm: string, from = new Date()) {
  const [hours, minutes] = normalizePracticeTime(hhmm).split(":").map(Number);
  const next = new Date(from);
  next.setHours(hours, minutes, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - from.getTime();
}

const LAST_NOTIFY_KEY = "ai-teacher:last-practice-notify";

export function alreadyNotifiedToday() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LAST_NOTIFY_KEY) === todayDateKey();
}

export function markNotifiedToday() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_NOTIFY_KEY, todayDateKey());
}

export async function requestNotificationPermission() {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported" as const;
  }
  if (Notification.permission === "granted") return "granted" as const;
  if (Notification.permission === "denied") return "denied" as const;
  const result = await Notification.requestPermission();
  return result;
}

export function showPracticeNotification(characterName: string) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }
  if (alreadyNotifiedToday()) return false;
  try {
    new Notification("Time to practice with BuddyAI!", {
      body: `Your daily session with ${characterName} is waiting. Let's go! 🌟`,
      tag: "buddyai-daily-practice",
    });
    markNotifiedToday();
    return true;
  } catch {
    return false;
  }
}
