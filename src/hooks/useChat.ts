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
  const hour = input.hour ?? new Date().getHours();
  const part = hour >= 5 && hour < 12 ? "this morning" : hour >= 12 && hour < 18 ? "this afternoon" : "this evening";
  const who = String(input.childName || "").trim();
  const en = who
    ? `Hey ${who}! Great to see you ${part}! Ready to practice some English?`
    : `Hey! Great to see you ${part}! Ready to practice some English?`;
  const he = who
    ? `היי ${who}! כיף לראות אותך! מוכן לתרגל אנגלית?`
    : `היי! כיף לראות אותך! מוכן לתרגל אנגלית?`;
  return { en, he };
}
