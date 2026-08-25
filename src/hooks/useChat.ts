import { messageTimestamp, sortMessagesNewestFirst } from "@/lib/exportTranscript";
import type { Message } from "@/types/chat";

export function sortConversationsNewestFirst<T extends { archivedAt?: number; createdAt?: number; created_at?: string }>(
  sessions: T[],
) {
  return [...sessions].sort((a, b) => messageTimestamp(b) - messageTimestamp(a));
}

export function newestFirstChatMessages(messages: Message[]) {
  return sortMessagesNewestFirst(messages);
}

export { messageTimestamp, sortMessagesNewestFirst };
