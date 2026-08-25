import type { Message } from "@/types/chat";

export function messageTimestamp(item: {
  timestamp?: number;
  created_at?: string | number;
  createdAt?: number;
  archivedAt?: number;
}) {
  if (Number(item.timestamp) > 0) return Number(item.timestamp);
  if (Number(item.createdAt) > 0) return Number(item.createdAt);
  if (Number(item.archivedAt) > 0) return Number(item.archivedAt);
  if (item.created_at != null) {
    const ts = new Date(item.created_at).getTime();
    if (Number.isFinite(ts)) return ts;
  }
  return 0;
}

export function splitMessagesIntoSittings(messages: Message[], gapMs = 2 * 60 * 60 * 1000) {
  const chrono = [...messages].sort((a, b) => messageTimestamp(a) - messageTimestamp(b));
  const groups: Message[][] = [];
  for (const message of chrono) {
    const ts = messageTimestamp(message);
    const current = groups[groups.length - 1];
    if (!current?.length) {
      groups.push([message]);
      continue;
    }
    const prevTs = messageTimestamp(current[current.length - 1]);
    const newDay = new Date(ts).toDateString() !== new Date(prevTs).toDateString();
    if (newDay || ts - prevTs > gapMs) groups.push([message]);
    else current.push(message);
  }
  return groups;
}

export function sortMessagesByOrder<T extends { timestamp?: number; created_at?: string | number }>(
  items: T[],
  newestFirst: boolean,
) {
  return [...items].sort((a, b) =>
    newestFirst ? messageTimestamp(b) - messageTimestamp(a) : messageTimestamp(a) - messageTimestamp(b),
  );
}

export function sortMessagesNewestFirst<T extends { timestamp?: number; created_at?: string | number }>(items: T[]) {
  return sortMessagesByOrder(items, true);
}

function formatClock(ts: number) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDay(ts: number) {
  try {
    return new Date(ts).toLocaleDateString([], {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

function dayKey(ts: number) {
  const date = new Date(ts);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function groupMessagesByDayNewestFirst(messages: Message[]) {
  const newest = sortMessagesNewestFirst(messages);
  const groups: Array<{ key: string; label: string; timestamp: number; messages: Message[] }> = [];
  for (const message of newest) {
    const ts = messageTimestamp(message);
    const key = dayKey(ts);
    const last = groups[groups.length - 1];
    if (last?.key === key) last.messages.push(message);
    else groups.push({ key, label: formatDay(ts), timestamp: ts, messages: [message] });
  }
  return groups.sort((a, b) => b.timestamp - a.timestamp);
}

export function buildTranscriptText(messages: Message[], tutorName: string, childName = "You") {
  const header = `BuddyAI transcript\n${new Date().toLocaleString()}\n(newest first)\n`;
  const body = groupMessagesByDayNewestFirst(messages)
    .map((group) => {
      const lines = group.messages.map((message) => {
        const who = message.sender === "ai" ? tutorName : childName;
        const time = formatClock(messageTimestamp(message));
        const block = [`[${group.label} ${time}] ${who}: ${message.text.trim()}`];
        if (message.sender === "ai" && message.translation?.trim()) {
          block.push(`  HE: ${message.translation.trim()}`);
        }
        return block.join("\n");
      });
      return lines.join("\n\n");
    })
    .join("\n\n");
  return `${header}\n${body}\n`;
}
