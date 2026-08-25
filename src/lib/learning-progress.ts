import type { Message } from "@/types/chat";
import { levelFromXp, nextLevelInfo, progressInLevel } from "@/lib/progression";

const WEEK_KEY = (userId: string) => `buddyai:practice-week:${userId}`;
const TUTOR_KEY = (userId: string) => `buddyai:tutors-met:${userId}`;

const TOPIC_TITLES: Array<{ re: RegExp; title: string }> = [
  { re: /\b(pizza|burger|food|eat|hungry|pasta|ice cream|chocolate|fruit|breakfast|lunch|dinner)\b/i, title: "🍕 Favorite Pizza & Food" },
  { re: /\b(beach|swim|ocean|sea|sand|wave|pool)\b/i, title: "🏖️ Trip to the Beach" },
  { re: /\b(music|song|singer|guitar|piano|dance|concert)\b/i, title: "🎵 Music & Favorite Artists" },
  { re: /\b(game|gaming|minecraft|fortnite|xbox|playstation|roblox)\b/i, title: "🎮 Games & Playtime" },
  { re: /\b(soccer|football|basketball|sport|team|goal|tennis)\b/i, title: "⚽ Sports & Team Fun" },
  { re: /\b(school|teacher|homework|class|friend)\b/i, title: "📚 School & Friends" },
  { re: /\b(dog|cat|pet|animal|zoo|horse)\b/i, title: "🐾 Pets & Animals" },
  { re: /\b(movie|film|cartoon|superhero|disney)\b/i, title: "🎬 Movies & Heroes" },
  { re: /\b(space|star|planet|rocket|moon|alien)\b/i, title: "🚀 Space Adventure" },
  { re: /\b(family|mom|dad|sister|brother|grandma)\b/i, title: "🏠 Family Time" },
];

function englishWords(text: string) {
  return (text.toLowerCase().match(/\b[a-z']{2,}\b/g) ?? []).filter((word) => word !== "i" && word !== "a");
}

export function uniqueEnglishWords(messages: Message[]) {
  const set = new Set<string>();
  for (const message of messages) {
    if (message.sender !== "user") continue;
    for (const word of englishWords(message.text)) set.add(word);
  }
  return [...set];
}

export function smartSessionTitle(messages: Message[], fallback = "Friendly chat") {
  const blob = messages
    .filter((message) => message.sender === "user")
    .map((message) => message.text)
    .join(" ");
  for (const topic of TOPIC_TITLES) {
    if (topic.re.test(blob)) return topic.title;
  }
  const words = englishWords(blob).slice(0, 4);
  if (words.length >= 2) {
    return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
  }
  return fallback;
}

export function recordWeekMinutes(userId: string, date: string, minutes: number) {
  if (typeof window === "undefined" || !userId) return;
  try {
    const current = loadWeekMinutes(userId);
    current[date] = Math.max(current[date] ?? 0, minutes);
    const keys = Object.keys(current).sort();
    while (keys.length > 21) delete current[keys.shift() as string];
    window.localStorage.setItem(WEEK_KEY(userId), JSON.stringify(current));
  } catch {
    /* ignore */
  }
}

export function loadWeekMinutes(userId: string): Record<string, number> {
  if (typeof window === "undefined" || !userId) return {};
  try {
    const raw = window.localStorage.getItem(WEEK_KEY(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function rememberTutorMet(userId: string, tutorId: string) {
  if (typeof window === "undefined" || !userId || !tutorId) return;
  try {
    const ids = new Set(loadTutorsMet(userId));
    ids.add(tutorId);
    window.localStorage.setItem(TUTOR_KEY(userId), JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

const GAMES_KEY = (userId: string) => `buddyai:games-won:${userId}`;

export function recordGameWin(userId: string, amount = 1) {
  if (typeof window === "undefined" || !userId) return;
  try {
    window.localStorage.setItem(GAMES_KEY(userId), String(loadGamesWon(userId) + amount));
  } catch {
    /* ignore */
  }
}

export function loadGamesWon(userId: string) {
  if (typeof window === "undefined" || !userId) return 0;
  try {
    return Math.max(0, Number(window.localStorage.getItem(GAMES_KEY(userId))) || 0);
  } catch {
    return 0;
  }
}

export function loadTutorsMet(userId: string): string[] {
  if (typeof window === "undefined" || !userId) return [];
  try {
    const raw = window.localStorage.getItem(TUTOR_KEY(userId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function dateKey(offset = 0) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

export function weekDays(weekMinutes: Record<string, number>, goalMinutes: number) {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  sunday.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + index);
    const key = day.toISOString().slice(0, 10);
    const minutes = Math.max(0, Number(weekMinutes[key]) || 0);
    return {
      key,
      label: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index],
      minutes,
      goalMinutes,
      complete: minutes >= goalMinutes,
    };
  });
}

export function activeStreak(weekMinutes: Record<string, number>) {
  let streak = 0;
  for (let offset = 0; offset > -30; offset -= 1) {
    const minutes = Number(weekMinutes[dateKey(offset)]) || 0;
    if (minutes <= 0) break;
    streak += 1;
  }
  return streak;
}

function skillBand(percent: number) {
  if (percent >= 71) return "Expert";
  if (percent >= 31) return "Intermediate";
  return "Beginner";
}

export function buildLearningSnapshot(input: {
  xp: number;
  messages: Message[];
  sessions: Array<{ characterId: string; messages: Message[] }>;
  weekMinutes: Record<string, number>;
  tutorsMet: string[];
  currentTutorId: string;
  goalMinutes: number;
  practicedMinutesToday: number;
  gamesWon?: number;
}) {
  const allMessages = [...input.messages, ...input.sessions.flatMap((session) => session.messages)];
  const allUserTurns = allMessages.filter((message) => message.sender === "user");
  const vocab = uniqueEnglishWords(allMessages);
  const tutors = new Set([
    input.currentTutorId,
    ...input.tutorsMet,
    ...input.sessions.map((session) => session.characterId),
  ]);
  const speaking = Math.min(100, Math.round((allUserTurns.length / 30) * 100));
  const gamesWon = Math.max(0, input.gamesWon ?? 0);
  const writing = Math.min(100, Math.round((vocab.length / 50) * 100));
  const days = weekDays(input.weekMinutes, input.goalMinutes).map((day) =>
    day.key === dateKey(0)
      ? {
          ...day,
          minutes: Math.max(day.minutes, input.practicedMinutesToday),
          complete: Math.max(day.minutes, input.practicedMinutesToday) >= input.goalMinutes,
        }
      : day,
  );
  const listenMinutes = days.reduce((sum, day) => sum + day.minutes, 0);
  const listening = Math.min(100, Math.round((gamesWon / 8) * 50 + (listenMinutes / 40) * 50));
  const goalDays = days.filter((day) => day.complete).length;
  const progress = progressInLevel(input.xp);
  const current = levelFromXp(input.xp);
  const next = nextLevelInfo(current.level);
  return {
    current,
    next,
    xp: input.xp,
    xpLabel: next ? `${input.xp} / ${next.minXp} XP` : `${input.xp} XP · Max level`,
    percent: progress.percent,
    streak: activeStreak(input.weekMinutes) || (input.practicedMinutesToday > 0 ? 1 : 0),
    skills: [
      {
        id: "speaking",
        emoji: "🗣️",
        title: "Speaking & Fluency",
        titleHe: "דיבור ושטף",
        percent: speaking,
        band: skillBand(speaking),
        detail: `${allUserTurns.length} turns spoken`,
      },
      {
        id: "listening",
        emoji: "👂",
        title: "Listening & Comprehension",
        titleHe: "הבנה והקשבה",
        percent: listening,
        band: skillBand(listening),
        detail: `${gamesWon} games · ${listenMinutes} min`,
      },
      {
        id: "writing",
        emoji: "✍️",
        title: "Vocabulary & Grammar",
        titleHe: "אוצר מילים וכתיבה",
        percent: writing,
        band: skillBand(writing),
        detail: `${vocab.length} words mastered`,
      },
    ],
    days,
    achievements: [
      { id: "first-words", emoji: "🌟", title: "First Words", hint: "Completed first chat", unlocked: allUserTurns.length >= 1 },
      { id: "explorer", emoji: "🚀", title: "Chat Explorer", hint: "Spoke with 3 tutors", unlocked: tutors.size >= 3 },
      { id: "goal-crusher", emoji: "🎯", title: "Goal Crusher", hint: "Hit 100% daily goal 5 days", unlocked: goalDays >= 5 },
      { id: "vocab-master", emoji: "🏆", title: "Vocab Master", hint: "Used 50+ unique English words", unlocked: vocab.length >= 50 },
    ],
    vocabCount: vocab.length,
  };
}

export type LearningSnapshot = ReturnType<typeof buildLearningSnapshot>;
