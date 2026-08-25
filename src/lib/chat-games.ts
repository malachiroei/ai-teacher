export type ChatGameType = "picture_match" | "fill_missing" | "listen_pick";

export interface PictureMatchData {
  prompt: string;
  emoji: string;
  options: string[];
  answer: string;
}

export interface FillMissingData {
  prompt: string;
  emoji: string;
  pattern: string;
  options: string[];
  answer: string;
}

export interface ListenPickData {
  prompt: string;
  speak: string;
  options: Array<{ emoji: string; label: string }>;
  answer: string;
}

export interface ChatGame {
  type: ChatGameType;
  data: PictureMatchData | FillMissingData | ListenPickData;
}

export const GAME_XP_REWARD = 15;
export const GAME_ROUND_LENGTH = 3;
export const GAME_ROUND_XP = GAME_XP_REWARD * GAME_ROUND_LENGTH;
const GAME_TAG = /<<<GAME:\s*(\{[\s\S]*?\})\s*>>>/i;

const PICTURE_BANK: PictureMatchData[] = [
  { prompt: "What animal is this?", emoji: "🦁", options: ["Lion", "Tiger", "Bear", "Cat"], answer: "Lion" },
  { prompt: "What food is this?", emoji: "🍕", options: ["Pizza", "Bread", "Cake", "Soup"], answer: "Pizza" },
  { prompt: "What is this?", emoji: "🚀", options: ["Rocket", "Car", "Boat", "Train"], answer: "Rocket" },
  { prompt: "What animal is this?", emoji: "🐶", options: ["Dog", "Fox", "Wolf", "Pig"], answer: "Dog" },
];

const BLANK_BANK: FillMissingData[] = [
  { prompt: "Fill the missing letter", emoji: "🍕", pattern: "P _ Z Z A", options: ["I", "E", "O", "A"], answer: "I" },
  { prompt: "Fill the missing letter", emoji: "🌙", pattern: "M O _ N", options: ["O", "A", "E", "U"], answer: "O" },
  { prompt: "Fill the missing letter", emoji: "⭐", pattern: "S T _ R", options: ["A", "E", "I", "O"], answer: "A" },
  { prompt: "Fill the missing letter", emoji: "🐠", pattern: "F I _ H", options: ["S", "T", "N", "R"], answer: "S" },
];

const LISTEN_BANK: ListenPickData[] = [
  {
    prompt: "Tap the picture you heard",
    speak: "apple",
    options: [
      { emoji: "🍎", label: "Apple" },
      { emoji: "🍌", label: "Banana" },
      { emoji: "🍇", label: "Grapes" },
    ],
    answer: "Apple",
  },
  {
    prompt: "Tap the picture you heard",
    speak: "cat",
    options: [
      { emoji: "🐱", label: "Cat" },
      { emoji: "🐶", label: "Dog" },
      { emoji: "🐭", label: "Mouse" },
    ],
    answer: "Cat",
  },
  {
    prompt: "Tap the picture you heard",
    speak: "sun",
    options: [
      { emoji: "☀️", label: "Sun" },
      { emoji: "🌧️", label: "Rain" },
      { emoji: "❄️", label: "Snow" },
    ],
    answer: "Sun",
  },
  {
    prompt: "Tap the picture you heard",
    speak: "fish",
    options: [
      { emoji: "🐠", label: "Fish" },
      { emoji: "🐦", label: "Bird" },
      { emoji: "🐢", label: "Turtle" },
    ],
    answer: "Fish",
  },
];

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

export function stripGameTag(text: string) {
  return String(text || "")
    .replace(GAME_TAG, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function extractGameFromText(text: string): { spoken: string; game: ChatGame | null } {
  const raw = String(text || "");
  const match = raw.match(GAME_TAG);
  if (!match) return { spoken: raw.trim(), game: null };
  try {
    const parsed = JSON.parse(match[1]) as { type?: string; data?: Record<string, unknown> };
    const type = parsed.type;
    const data = parsed.data ?? {};
    if (type === "picture_match") {
      const options = asStringArray(data.options);
      const answer = String(data.answer || options[0] || "").trim();
      if (options.length >= 2 && answer) {
        return {
          spoken: stripGameTag(raw),
          game: {
            type,
            data: {
              prompt: String(data.prompt || "What is this?"),
              emoji: String(data.emoji || "🌟"),
              options: options.slice(0, 4),
              answer,
            },
          },
        };
      }
    }
    if (type === "fill_missing") {
      const options = asStringArray(data.options);
      const answer = String(data.answer || "").trim();
      if (options.length >= 2 && answer) {
        return {
          spoken: stripGameTag(raw),
          game: {
            type,
            data: {
              prompt: String(data.prompt || "Fill the missing letter"),
              emoji: String(data.emoji || "✏️"),
              pattern: String(data.pattern || data.word || "___"),
              options: options.slice(0, 6),
              answer,
            },
          },
        };
      }
    }
    if (type === "listen_pick") {
      const options = Array.isArray(data.options)
        ? data.options
            .map((item) => {
              if (item && typeof item === "object") {
                const row = item as { emoji?: string; label?: string };
                return { emoji: String(row.emoji || "⭐"), label: String(row.label || "").trim() };
              }
              return { emoji: "⭐", label: String(item).trim() };
            })
            .filter((item) => item.label)
        : [];
      const answer = String(data.answer || options[0]?.label || "").trim();
      if (options.length >= 2 && answer) {
        return {
          spoken: stripGameTag(raw),
          game: {
            type,
            data: {
              prompt: String(data.prompt || "Tap what you heard"),
              speak: String(data.speak || answer),
              options: options.slice(0, 4),
              answer,
            },
          },
        };
      }
    }
  } catch {
    /* ignore malformed payload */
  }
  return { spoken: stripGameTag(raw), game: null };
}

let gameCursor = 0;

export function createQuickGame(type?: ChatGameType): ChatGame {
  const kinds: ChatGameType[] = ["picture_match", "fill_missing", "listen_pick"];
  const next = type ?? kinds[gameCursor % kinds.length];
  gameCursor += 1;
  if (next === "fill_missing") return { type: next, data: BLANK_BANK[gameCursor % BLANK_BANK.length] };
  if (next === "listen_pick") return { type: next, data: LISTEN_BANK[gameCursor % LISTEN_BANK.length] };
  return { type: "picture_match", data: PICTURE_BANK[gameCursor % PICTURE_BANK.length] };
}

export function createQuickGameRound(): ChatGame[] {
  const seen = new Set<string>();
  const round: ChatGame[] = [];
  let guard = 0;
  while (round.length < GAME_ROUND_LENGTH && guard < 24) {
    const game = createQuickGame();
    const key = `${game.type}:${getGameAnswer(game).toLowerCase()}`;
    guard += 1;
    if (seen.has(key)) continue;
    seen.add(key);
    round.push(game);
  }
  while (round.length < GAME_ROUND_LENGTH) round.push(createQuickGame());
  return round;
}

export function expandToGameRound(first?: ChatGame | null): ChatGame[] {
  const rest = createQuickGameRound().filter(
    (game) => !first || getGameAnswer(game).toLowerCase() !== getGameAnswer(first).toLowerCase(),
  );
  if (!first) return rest.slice(0, GAME_ROUND_LENGTH);
  return [first, ...rest].slice(0, GAME_ROUND_LENGTH);
}

export function isCorrectGameChoice(game: ChatGame, choice: string) {
  return choice.trim().toLowerCase() === String(getGameAnswer(game)).trim().toLowerCase();
}

export function getGameAnswer(game: ChatGame) {
  return game.data.answer;
}
