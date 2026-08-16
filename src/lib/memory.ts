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

function isMemoryKind(value: unknown): value is MemoryKind {
  return typeof value === "string" && KINDS.includes(value as MemoryKind);
}

export function normalizeNewMemories(value: unknown): NewMemory[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const memories: NewMemory[] = [];
  for (const item of value) {
    const row = item as Partial<NewMemory> & { text?: string };
    const fact = String(row.fact || row.text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (fact.length < 8) continue;
    const key = fact.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    memories.push({
      fact: fact.slice(0, 180),
      kind: isMemoryKind(row.kind) ? row.kind : "personal",
      eventOn: row.eventOn ? String(row.eventOn).slice(0, 10) : null,
    });
  }
  return memories.slice(0, 4);
}

export function formatMemoriesForPrompt(memories: UserMemory[]) {
  if (memories.length === 0) return "";
  const lines = memories
    .slice(0, 12)
    .map((memory) => {
      const when = memory.eventOn ? ` (date: ${memory.eventOn})` : "";
      return `- [${memory.kind}] ${memory.fact}${when}`;
    })
    .join("\n");
  return `LONG-TERM MEMORY (facts the learner previously shared — use naturally, never quiz them):
${lines}

If this is their first session of a new day, open with a warm callback when a memory fits (plans from yesterday, a test, a trip, a pet, a game they like). Example vibe: "Hey! You mentioned yesterday you were going to the beach — how was it?! 🌊"
Do not invent memories that are not listed.`;
}
