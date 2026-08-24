import { isSimpleGreeting } from "@/lib/language";
import type { Gender } from "@/lib/supabase/types";
import type { Message } from "@/types/chat";

function asGender(gender?: Gender | string | null): Gender | null {
  if (gender === "girl" || gender === "boy" || gender === "other") return gender;
  return null;
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export const PLACEMENT_STEPS = 3;

export const PLACEMENT_SUGGESTIONS = [
  ["My name is Tom.", "I'm Maya.", "I like English!"],
  ["I am in 4th grade.", "I'm in third grade.", "I am nine."],
  ["I like football!", "I like Roblox!", "I like math!"],
] as const;

export function isPlacementOpener(text: string) {
  const n = text.replace(/\s+/g, " ").trim();
  if (/what is your name\?/i.test(n) && /^(hi|hey|hello)\b/i.test(n)) return true;
  return /hi!?\s+i'?m .+\s+what is your name\?/i.test(n);
}

export function placementUserTurns(messages: Pick<Message, "sender">[]) {
  return messages.filter((message) => message.sender === "user").length;
}

export function placementAnswerTurns(messages: Pick<Message, "sender" | "text">[]) {
  return messages.filter((message) => message.sender === "user" && !isSimpleGreeting(message.text)).length;
}

export function isPlacementActive(
  messages: Pick<Message, "sender" | "text">[],
  completed = false,
) {
  if (completed) return false;
  const firstAi = messages.find((message) => message.sender === "ai");
  if (!firstAi || !isPlacementOpener(firstAi.text)) return false;
  return placementAnswerTurns(messages) < PLACEMENT_STEPS;
}

export function isKidsPlacementSession(
  messages: Pick<Message, "sender" | "text">[],
  completed = false,
) {
  if (completed) return false;
  const firstAi = messages.find((message) => message.sender === "ai");
  if (!firstAi || !isPlacementOpener(firstAi.text)) return false;
  return placementAnswerTurns(messages) <= PLACEMENT_STEPS;
}

export const KIDS_PLACEMENT_STORAGE_KEY = "kids_placement_complete";

export function kidsPlacementStorageKey(userId: string) {
  return `${KIDS_PLACEMENT_STORAGE_KEY}:${userId}`;
}

export function hasFinishedKidsPlacement(messages: Pick<Message, "sender" | "text">[]) {
  const firstAi = messages.find((message) => message.sender === "ai");
  if (!firstAi || !isPlacementOpener(firstAi.text)) return false;
  return placementAnswerTurns(messages) >= PLACEMENT_STEPS;
}

export function hasCompletedKidsPlacement(
  userId?: string | null,
  messages: Pick<Message, "sender" | "text">[] = [],
  profile?: { placement_completed?: boolean | null } | null,
) {
  if (profile?.placement_completed) return true;
  if (hasFinishedKidsPlacement(messages)) return true;
  if (!userId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(kidsPlacementStorageKey(userId)) === "1";
  } catch {
    return false;
  }
}

export function markKidsPlacementComplete(userId?: string | null) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(kidsPlacementStorageKey(userId), "1");
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearKidsPlacementComplete(userId?: string | null) {
  if (!userId || typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(kidsPlacementStorageKey(userId));
  } catch {
    /* ignore */
  }
}

export function placementStepIndex(messages: Pick<Message, "sender" | "text">[], completed = false) {
  if (completed) return PLACEMENT_STEPS;
  if (!isPlacementActive(messages) && !messages.some((message) => message.sender === "ai" && isPlacementOpener(message.text))) {
    return -1;
  }
  return Math.min(placementAnswerTurns(messages), PLACEMENT_STEPS);
}

export function buildPlacementOpener(tutorName: string, _gender?: Gender | string | null): Message {
  const name = tutorName.trim() || "Max";

  return {
    id: createId(),
    sender: "ai",
    text: `Hi! I'm ${name}! What is your name?`,
    timestamp: Date.now(),
    translation: `היי! אני ${name}! איך קוראים לך?`,
  };
}

export function placementFollowUp(
  userTurnsAfterReply: number,
  childName: string,
  gender?: Gender | string | null,
): { text: string; translation: string; suggestions: string[] } {
  const name = childName.trim();
  const girl = asGender(gender) === "girl";

  if (userTurnsAfterReply <= 1) {
    const text = name
      ? `Nice to meet you, ${name}! What grade are you in at school? 🏫`
      : "Nice to meet you! What grade are you in at school? 🏫";
    const translation = name
      ? girl
        ? `נעים להכיר, ${name}! באיזו כיתה את בבית הספר?`
        : `נעים להכיר, ${name}! באיזו כיתה אתה בבית הספר?`
      : girl
        ? "נעים להכיר! באיזו כיתה את בבית הספר?"
        : "נעים להכיר! באיזו כיתה אתה בבית הספר?";
    return { text, translation, suggestions: [...PLACEMENT_SUGGESTIONS[1]] };
  }

  if (userTurnsAfterReply === 2) {
    return {
      text: "What is your favorite thing to learn or play? 🎮",
      translation: girl
        ? "מה הדבר האהוב עליך ללמוד או לשחק?"
        : "מה הדבר האהוב עליך ללמוד או לשחק?",
      suggestions: [...PLACEMENT_SUGGESTIONS[2]],
    };
  }

  return {
    text: name ? `Awesome, ${name}! Let's talk and play in English.` : "Awesome! Let's talk and play in English.",
    translation: name
      ? girl
        ? `מעולה, ${name}! בואי נדבר ונשחק באנגלית.`
        : `מעולה, ${name}! בוא נדבר ונשחק באנגלית.`
      : "מעולה! בואו נדבר ונשחק באנגלית.",
    suggestions: ["I like pizza!", "Let's play a game!", "I like blue."],
  };
}

export function buildFriendshipOpener(
  tutorName: string,
  childName: string,
  favorite?: string,
  gender?: Gender | string | null,
): Message {
  const name = childName.trim() || "friend";
  const girl = asGender(gender) === "girl";
  const thing = favorite?.trim();
  if (thing) {
    return {
      id: createId(),
      sender: "ai",
      text: `Hey ${name}! I still remember you like ${thing}. What did you do today?`,
      timestamp: Date.now(),
      translation: girl
        ? `היי ${name}! אני זוכרת שאת אוהבת ${thing}. מה עשית היום?`
        : `היי ${name}! אני זוכר שאתה אוהב ${thing}. מה עשית היום?`,
    };
  }

  return {
    id: createId(),
    sender: "ai",
      text: `Hey ${name}! Good to see you. How has your day been so far?`,
      timestamp: Date.now(),
      translation: girl
        ? `היי ${name}! כיף לראות אותך. איך היה היום שלך עד עכשיו?`
        : `היי ${name}! כיף לראות אותך. איך היה היום שלך עד עכשיו?`,
  };
}

export function guessSpokenName(text: string) {
  if (isSimpleGreeting(text)) return "";
  const cleaned = text.replace(/[.!?]/g, " ").trim();
  const named = cleaned.match(/(?:my name is|i am|i'm|i’m)\s+([A-Za-z\u0590-\u05FF]{2,20})/i);
  if (named?.[1] && !isSimpleGreeting(named[1])) return named[1];
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0].length <= 20 && !isSimpleGreeting(words[0])) return words[0];
  return "";
}
