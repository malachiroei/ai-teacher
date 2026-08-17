export const XP_FOR_WORDS = 15;
export const XP_FOR_SENTENCE = 25;
export const MAX_LEVEL = 4;

export interface LevelInfo {
  level: number;
  title: string;
  emoji: string;
  minXp: number;
}

export const LEVELS: readonly LevelInfo[] = [
  { level: 1, title: "English Explorer", emoji: "🌟", minXp: 0 },
  { level: 2, title: "Word Master", emoji: "🚀", minXp: 100 },
  { level: 3, title: "Sentence Hero", emoji: "🦸", minXp: 250 },
  { level: 4, title: "Conversation Champion", emoji: "👑", minXp: 500 },
] as const;

export interface ProgressionState {
  xp: number;
  level: number;
  placement_completed: boolean;
}

function progressionKey(userId: string) {
  return `buddyai:progression:${userId}`;
}

export function levelFromXp(xp: number): LevelInfo {
  const safe = Math.max(0, Number(xp) || 0);
  let current = LEVELS[0];
  for (const row of LEVELS) {
    if (safe >= row.minXp) current = row;
  }
  return current;
}

export function nextLevelInfo(level: number): LevelInfo | null {
  return LEVELS.find((row) => row.level === level + 1) ?? null;
}

export function progressInLevel(xp: number) {
  const current = levelFromXp(xp);
  const next = nextLevelInfo(current.level);
  const start = current.minXp;
  const span = Math.max(1, (next?.minXp ?? start) - start);
  const into = next ? Math.max(0, Math.min(span, (Number(xp) || 0) - start)) : span;
  return {
    current,
    next,
    into,
    span,
    percent: next ? Math.min(100, Math.round((into / span) * 100)) : 100,
  };
}

export function looksLikeFullSentence(text: string) {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 4) return true;
  if (words.length >= 3 && /[.!?]/.test(trimmed)) return true;
  return words.length >= 3 && /\b(i |i'm |i am |i like |i love |my |we |she |he )/i.test(trimmed);
}

export function xpForUtterance(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;
  return looksLikeFullSentence(text) ? XP_FOR_SENTENCE : XP_FOR_WORDS;
}

export function applyXp(xp: number, gained: number) {
  const before = levelFromXp(xp);
  const nextXp = Math.max(0, (Number(xp) || 0) + Math.max(0, gained));
  const after = levelFromXp(nextXp);
  return {
    xp: nextXp,
    level: after.level,
    leveledUp: after.level > before.level,
    info: after,
  };
}

export function normalizeProgression(value?: Partial<ProgressionState> | null): ProgressionState {
  const xp = Math.max(0, Number(value?.xp) || 0);
  const fromXp = levelFromXp(xp);
  const level = Math.min(MAX_LEVEL, Math.max(1, Number(value?.level) || fromXp.level));
  return {
    xp,
    level: Math.max(level, fromXp.level),
    placement_completed: Boolean(value?.placement_completed),
  };
}

export function readProgressionLocal(userId?: string | null): ProgressionState {
  const empty = normalizeProgression(null);
  if (!userId || typeof window === "undefined") return empty;
  try {
    const raw = window.localStorage.getItem(progressionKey(userId));
    if (!raw) return empty;
    return normalizeProgression(JSON.parse(raw) as Partial<ProgressionState>);
  } catch {
    return empty;
  }
}

export function writeProgressionLocal(userId: string | null | undefined, state: Partial<ProgressionState>) {
  if (!userId || typeof window === "undefined") return;
  try {
    const merged = normalizeProgression({ ...readProgressionLocal(userId), ...state });
    window.localStorage.setItem(progressionKey(userId), JSON.stringify(merged));
  } catch {
    /* ignore quota / private mode */
  }
}

export function levelCheer(info: LevelInfo) {
  return `Yay! Level ${info.level}! You are a ${info.title} now! ${info.emoji}`;
}
