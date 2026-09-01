import type { ArchivedChatSession } from "@/lib/chat-history";
import { CHILD_MEMORY_STORAGE_KEY, loadChildMemoryLocal, parseChildMemory } from "@/lib/child-memory";
import { sortMessagesNewestFirst } from "@/lib/exportTranscript";
import type { ChildMemoryProfile } from "@/types/childProfile";
import type { Message } from "@/types/chat";

function epochFromUnknown(raw: unknown): number {
  if (raw == null || raw === "") return 0;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1e12) return raw;
    if (raw > 1e9) return Math.round(raw * 1000);
    return 0;
  }
  const parsed = Date.parse(String(raw));
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Strict numeric epoch for a session. Never uses locale date strings for ordering. */
export function getTimestamp(session: {
  updated_at?: string;
  last_message_at?: string;
  created_at?: string;
  timestamp?: number | string;
  archivedAt?: number;
  createdAt?: number;
  messages?: Array<{ timestamp?: number; created_at?: string | number }>;
}): number {
  const header = Math.max(
    epochFromUnknown(session.updated_at),
    epochFromUnknown(session.last_message_at),
    epochFromUnknown(session.created_at),
    epochFromUnknown(session.timestamp),
    epochFromUnknown(session.archivedAt),
    epochFromUnknown(session.createdAt),
  );
  const lastMessage = (session.messages ?? []).reduce((max, message) => {
    const ts = Math.max(epochFromUnknown(message.timestamp), epochFromUnknown(message.created_at));
    return ts > max ? ts : max;
  }, 0);
  return Math.max(header, lastMessage);
}

export function sortConversationsNewestFirst<T extends ArchivedChatSession | Parameters<typeof getTimestamp>[0]>(
  sessions: T[],
) {
  return [...sessions].sort((a, b) => getTimestamp(b) - getTimestamp(a));
}

export function newestFirstChatMessages(messages: Message[]) {
  return sortMessagesNewestFirst(messages);
}

export function readChildMemoryForChat(userId?: string | null): ChildMemoryProfile {
  if (typeof window === "undefined") return loadChildMemoryLocal(userId);
  try {
    const scoped = userId ? window.localStorage.getItem(`${CHILD_MEMORY_STORAGE_KEY}:${userId}`) : null;
    const shared = window.localStorage.getItem(CHILD_MEMORY_STORAGE_KEY);
    return parseChildMemory(scoped || shared);
  } catch {
    return loadChildMemoryLocal(userId);
  }
}

export { getTimestamp as sessionLatestTimestamp };

export const FRESH_SESSION_IDLE_MS = 20 * 60 * 1000;

export function lastInteractionAt(messages: Message[]) {
  return messages.reduce((max, message) => Math.max(max, Number(message.timestamp) || 0), 0);
}

export function shouldStartFreshSession(messages: Message[], now = Date.now()) {
  if (!messages.length) return true;
  const last = lastInteractionAt(messages);
  return last > 0 && now - last > FRESH_SESSION_IDLE_MS;
}

export function buildWarmLaunchGreeting(input: { childName?: string | null; hour?: number }) {
  const who = String(input.childName || "").trim();
  const he = who
    ? `היי ${who}! איזה כיף שבאת ללמוד איתי היום. איך עבר היום שלך?`
    : `היי! איזה כיף שבאת ללמוד איתי היום. איך עבר היום שלך?`;
  const en = who
    ? `Hi ${who}! So glad you're here today. How was your day?`
    : `Hi! So glad you're here today. How was your day?`;
  return { en, he };
}

/** Tutor speaks if the child is quiet this long. */
export const PROACTIVE_IDLE_MS = 4000;

export type ProactivePrompt = {
  /** Hebrew — primary spoken line for warm onboarding. */
  he: string;
  /** Short English gloss / subtitle support. */
  en: string;
  chips: [string, string];
};

const WARM_HEBREW_PROMPTS: ProactivePrompt[] = [
  {
    he: "כיף לראות אותך! מה המאכל הכי אהוב עליך, גלידה או פיצה?",
    en: "Great to see you! What's your favorite food, ice cream or pizza?",
    chips: ["🍦 גלידה", "🍕 פיצה"],
  },
  {
    he: "היי! איזה כיף שבאת ללמוד איתי היום. איך עבר היום שלך?",
    en: "Hi! So glad you're here. How was your day?",
    chips: ["😊 טוב!", "🙂 בסדר"],
  },
  {
    he: "היי! בא לך שנדבר על חיות, או על אוכל טעים?",
    en: "Want to chat about animals, or tasty food?",
    chips: ["🐶 חיות", "🍕 אוכל"],
  },
  {
    he: "כיף לראות אותך! איך עבר עליך היום, שמח או עייף?",
    en: "Good to see you! Did you feel happy or tired today?",
    chips: ["😊 Happy", "😴 Tired"],
  },
  {
    he: "היי! יש לך חיה אהובה בבית, או חיה שאתה אוהב לדמיין?",
    en: "Do you have a favorite pet, or an animal you love?",
    chips: ["🐱 יש!", "🦁 לא"],
  },
  {
    he: "יופי שבאת! מה עשית היום שהכי כיף לך?",
    en: "What was the most fun thing you did today?",
    chips: ["🎮 שיחקתי", "📚 למדתי"],
  },
];

export function pickProactivePrompt(seed = Date.now()) {
  const index = Math.abs(seed) % WARM_HEBREW_PROMPTS.length;
  return WARM_HEBREW_PROMPTS[index];
}

export function proactiveChips(prompt: ProactivePrompt) {
  return [...prompt.chips];
}
