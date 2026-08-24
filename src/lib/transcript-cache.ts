import type { Message } from "@/types/chat";

function cacheKey(userId: string) {
  return `chat_transcript_v1:${userId}`;
}

export function readTranscriptCache(userId: string | null | undefined): Message[] {
  if (!userId || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(cacheKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Message[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.text === "string" && typeof item.timestamp === "number");
  } catch {
    return [];
  }
}

export function writeTranscriptCache(userId: string | null | undefined, messages: Message[]) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(cacheKey(userId), JSON.stringify(messages.slice(-400)));
  } catch {
    /* quota / private mode */
  }
}

export function mergeTranscriptMessages(primary: Message[], extra: Message[]) {
  const byId = new Map<string, Message>();
  for (const message of [...extra, ...primary]) {
    if (!message?.id) continue;
    const existing = byId.get(message.id);
    if (!existing || message.timestamp >= existing.timestamp) byId.set(message.id, message);
  }
  return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
}
