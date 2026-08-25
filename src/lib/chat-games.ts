export type ChatGameType = "picture_match" | "fill_missing" | "listen_pick" | "math_match";

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

export interface MathMatchData {
  prompt: string;
  equation: string;
  options: string[];
  answer: string;
  emoji?: string;
}

export interface ChatGame {
  type: ChatGameType;
  data: PictureMatchData | FillMissingData | ListenPickData | MathMatchData;
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
    if (type === "math_match") {
      const options = asStringArray(data.options);
      const answer = String(data.answer || options[0] || "").trim();
      if (options.length >= 2 && answer) {
        return {
          spoken: stripGameTag(raw),
          game: {
            type,
            data: {
              prompt: String(data.prompt || "What is the answer in English?"),
              equation: String(data.equation || data.prompt || "TWO + THREE = ?"),
              options: options.slice(0, 4),
              answer,
              emoji: String(data.emoji || "➕"),
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

const MATH_BANK: MathMatchData[] = [
  {
    prompt: "Pop the English answer!",
    equation: "TWO + THREE = ?",
    options: ["4 — FOUR", "5 — FIVE", "6 — SIX"],
    answer: "5 — FIVE",
    emoji: "➕",
  },
  {
    prompt: "Pop the English answer!",
    equation: "THREE × FOUR = ?",
    options: ["7 — SEVEN", "12 — TWELVE", "8 — EIGHT"],
    answer: "12 — TWELVE",
    emoji: "✖️",
  },
  {
    prompt: "Pop the English answer!",
    equation: "FIVE + TWO = ?",
    options: ["6 — SIX", "7 — SEVEN", "9 — NINE"],
    answer: "7 — SEVEN",
    emoji: "➕",
  },
];

let gameCursor = 0;

export function createMathEnglishGame(): ChatGame {
  const data = MATH_BANK[gameCursor % MATH_BANK.length];
  gameCursor += 1;
  return { type: "math_match", data };
}

export function createMathGameRound(): ChatGame[] {
  return [createMathEnglishGame(), createQuickGame("listen_pick"), createQuickGame("fill_missing")];
}

export function createQuickGame(type?: ChatGameType): ChatGame {
  const kinds: ChatGameType[] = ["picture_match", "fill_missing", "listen_pick"];
  const next = type ?? kinds[gameCursor % kinds.length];
  gameCursor += 1;
  if (next === "math_match") return createMathEnglishGame();
  if (next === "fill_missing") return { type: next, data: BLANK_BANK[gameCursor % BLANK_BANK.length] };
  if (next === "listen_pick") return { type: next, data: LISTEN_BANK[gameCursor % LISTEN_BANK.length] };
  return { type: "picture_match", data: PICTURE_BANK[gameCursor % PICTURE_BANK.length] };
}

export function createQuickGameRound(): ChatGame[] {
  return [
    createQuickGame("picture_match"),
    createQuickGame("listen_pick"),
    createQuickGame("fill_missing"),
  ];
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

const SPEECH_ALIASES: Record<string, string[]> = {
  sun: ["son", "sung", "some"],
  cat: ["kat", "cap", "cut"],
  lion: ["lying", "lyon", "leon"],
  dog: ["dawg", "doug"],
  pizza: ["pitsa", "piza"],
  five: ["5", "five"],
  four: ["4", "for", "four"],
  six: ["6", "six"],
  seven: ["7", "seven"],
  twelve: ["12", "twelve"],
};

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  const rows = a.length + 1;
  const cols = b.length + 1;
  const grid = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) grid[i][0] = i;
  for (let j = 0; j < cols; j += 1) grid[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      grid[i][j] = Math.min(
        grid[i - 1][j] + 1,
        grid[i][j - 1] + 1,
        grid[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return grid[a.length][b.length];
}

export function transcriptMatchesChoice(spoken: string, choice: string) {
  const hay = spoken.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const needle = choice.toLowerCase().trim();
  if (!hay || !needle) return false;
  const words = hay.split(/\s+/).filter(Boolean);
  const tokens = needle.split(/[^a-z0-9]+/).filter(Boolean);
  if (hay === needle || hay.includes(needle) || words.includes(needle)) return true;
  if (tokens.some((token) => token.length > 1 && (hay.includes(token) || words.includes(token)))) return true;
  const aliases = [...tokens, needle].flatMap((token) => SPEECH_ALIASES[token] ?? []);
  if (aliases.some((alias) => hay.includes(alias) || words.includes(alias))) return true;
  return words.some((word) => word.length >= 2 && tokens.some((token) => editDistance(word, token) <= 1));
}

const WORD_EMOJI: Record<string, string> = {
  pizza: "🍕",
  bread: "🍞",
  cake: "🍰",
  soup: "🍲",
  lion: "🦁",
  tiger: "🐯",
  bear: "🐻",
  cat: "🐱",
  dog: "🐶",
  fox: "🦊",
  wolf: "🐺",
  pig: "🐷",
  rocket: "🚀",
  car: "🚗",
  boat: "⛵",
  train: "🚂",
  apple: "🍎",
  banana: "🍌",
  grapes: "🍇",
  four: "4️⃣",
  five: "5️⃣",
  six: "6️⃣",
  seven: "7️⃣",
  twelve: "1️⃣2️⃣",
  sun: "☀️",
  rain: "🌧️",
  snow: "❄️",
  fish: "🐠",
  bird: "🐦",
  turtle: "🐢",
  moon: "🌙",
  star: "⭐",
};

/** Icon for a balloon/option label. Never reuse another option's emoji. */
export function emojiForOptionLabel(label: string) {
  const raw = label.trim().toLowerCase();
  if (WORD_EMOJI[raw]) return WORD_EMOJI[raw];
  const last = raw.split(/[^a-z0-9]+/).filter(Boolean).pop() || "";
  return WORD_EMOJI[last] || "";
}

export function fillPatternParts(pattern: string) {
  return String(pattern || "")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}
