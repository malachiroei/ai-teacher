import type { ArchivedChatSession } from "@/lib/chat-history";
import { messageTimestamp, sortMessagesNewestFirst } from "@/lib/exportTranscript";
import type { Message } from "@/types/chat";

export function sessionLatestTimestamp(session: {
  messages?: Array<{ timestamp?: number; created_at?: string | number }>;
  archivedAt?: number;
  createdAt?: number;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
}) {
  const fromRow = [
    session.updated_at,
    session.last_message_at,
    session.created_at,
  ]
    .map((value) => (value ? new Date(value).getTime() : 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const lastMessage = (session.messages ?? []).reduce((max, message) => {
    const ts = messageTimestamp(message);
    return ts > max ? ts : max;
  }, 0);
  return Math.max(lastMessage, session.archivedAt || 0, session.createdAt || 0, ...fromRow);
}

export function sortConversationsNewestFirst<T extends ArchivedChatSession | {
  messages?: Array<{ timestamp?: number }>;
  archivedAt?: number;
  createdAt?: number;
  created_at?: string;
  updated_at?: string;
  last_message_at?: string;
}>(sessions: T[]) {
  return [...sessions].sort((a, b) => sessionLatestTimestamp(b) - sessionLatestTimestamp(a));
}

export function newestFirstChatMessages(messages: Message[]) {
  return sortMessagesNewestFirst(messages);
}

export { messageTimestamp, sortMessagesNewestFirst };
