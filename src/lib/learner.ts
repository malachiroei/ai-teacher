import type { Profile, ProfileInput } from "@/lib/supabase/types";
import type { Message } from "@/types/chat";
import { buildCharacterGreeting, getCharacter, type Character } from "@/lib/characters";
import { hebrewTranslationGuide } from "@/lib/hebrew";
import { formatMemoriesForPrompt, type UserMemory } from "@/lib/memory";

export const INTEREST_OPTIONS = ["Movies", "Cars", "Travel", "Sports", "Tech", "Music", "Food", "Games"] as const;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function parseTutorNicknames(value: unknown): Record<string, string> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .map(([id, name]) => [id, String(name ?? "").trim()] as const)
        .filter(([, name]) => name.length > 0),
    );
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return {};
    try {
      return parseTutorNicknames(JSON.parse(text));
    } catch {
      return {};
    }
  }
  return {};
}

export function serializeTutorNicknames(value: unknown) {
  return JSON.stringify(parseTutorNicknames(value));
}

export function englishDisplayName(profile?: Profile | ProfileInput | null) {
  const fallbackName = profile && "name" in profile ? profile.name : "";
  return String(profile?.nickname || fallbackName || "").trim();
}

export function namePronunciation(profile?: Profile | ProfileInput | null) {
  return String(profile?.name_pronunciation ?? "").trim();
}

export function tutorDisplayName(character: Character, profile?: Profile | ProfileInput | null) {
  const map = parseTutorNicknames(profile?.tutor_nicknames);
  const fromMap = map[character.id]?.trim();
  if (fromMap) return fromMap;

  const custom = String(profile?.custom_tutor_name ?? "").trim();
  const selectedId = profile?.selected_character ? getCharacter(profile.selected_character).id : character.id;
  if (custom && selectedId === character.id) return custom;
  return character.name;
}

export function withTutorDisplayName(character: Character, profile?: Profile | ProfileInput | null): Character {
  const name = tutorDisplayName(character, profile);
  return name === character.name ? character : { ...character, name };
}

export function profilePayload(profile: Profile | ProfileInput | null | undefined): ProfileInput | null {
  if (!profile) return null;
  const fullName = "full_name" in profile ? profile.full_name : undefined;
  const nickname = profile.nickname || ("name" in profile ? profile.name : "") || fullName || "";
  const interests = Array.isArray(profile.interests)
    ? profile.interests
    : String(profile.interests ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  const character = getCharacter("selected_character" in profile ? profile.selected_character : undefined);
  return {
    nickname,
    name: fullName || nickname,
    name_pronunciation: namePronunciation(profile),
    age: profile.age,
    gender: profile.gender,
    english_level: profile.english_level || ("englishLevel" in profile ? profile.englishLevel : undefined),
    englishLevel: ("englishLevel" in profile ? profile.englishLevel : undefined) || profile.english_level,
    interests,
    selected_character: character.id,
    custom_tutor_name: tutorDisplayName(character, profile),
    tutor_nicknames: parseTutorNicknames(profile.tutor_nicknames),
    preferred_voice: "preferred_voice" in profile ? profile.preferred_voice : undefined,
  };
}

export function buildWelcomeMessage(profile?: Profile | null): Message {
  const character = getCharacter(profile?.selected_character);
  const greeting = buildCharacterGreeting(character, profile);

  return {
    id: createId(),
    sender: "ai",
    text: greeting.text,
    timestamp: Date.now(),
    translation: greeting.translation,
  };
}

function ageBand(age: number) {
  if (!Number.isFinite(age) || age <= 0) return "pre-teen to mid-teen (11–15): keep it playful, clear, and age-safe";
  if (age <= 10) return "younger child: very simple words, short sentences, lots of encouragement";
  if (age <= 12) return "11–12: everyday vocabulary, short-to-medium sentences, playful tone";
  if (age <= 15) return "13–15: slightly richer vocabulary, still teen-friendly, no adult slang";
  return "older teen: natural English, still warm and supportive";
}

function skillGuidance(level: string) {
  if (level === "beginner") {
    return "A1–A2: very simple words, 4–10 word sentences, repeat key phrases, model a sentence they can copy";
  }
  if (level === "advanced") {
    return "B2–C1: natural, native-like English, still warm; challenge with richer vocab only when they are succeeding";
  }
  return "B1: clear everyday English, a little challenge is OK, still short enough for chat";
}

export function buildLearnerContext(
  profile?: ProfileInput | null,
  extras?: { memories?: UserMemory[]; isFirstSessionToday?: boolean },
) {
  if (!profile) return "";

  const pronouns =
    profile.gender === "girl" ? "she/her" : profile.gender === "boy" ? "he/him" : "they/them";
  const hebrew = hebrewTranslationGuide(profile.gender);
  const level = String(profile.english_level || profile.englishLevel || "beginner");
  const vocab = skillGuidance(level);
  const englishName = englishDisplayName(profile) || "learner";
  const pronounced = namePronunciation(profile);
  const age = Number(profile.age) || 13;
  const tutorName = String(profile.custom_tutor_name ?? "").trim();

  const nameLine = pronounced
    ? `The learner's name is ${englishName} (pronounced ${pronounced}). Always refer to them consistently as '${englishName}' and do not misspell or mispronounce it.`
    : `The learner's name is ${englishName}. Always refer to them consistently as '${englishName}' and do not misspell or mispronounce it.`;

  return `LEARNER PROFILE (always use this):
- ${nameLine}
- Age: ${age} — ${ageBand(age)}
- Gender: ${profile.gender} (English pronouns ${pronouns})
- Hebrew address: ${hebrew}
- English level / detected skill: ${level} (${vocab})
- Interests: ${
    Array.isArray(profile.interests)
      ? profile.interests.join(", ")
      : profile.interests || "everyday topics"
  }
- Interest nouns in Hebrew: Movies=סרטים, Cars=מכוניות, Travel=טיולים, Sports=ספורט, Tech=טכנולוגיה, Music=מוזיקה, Food=אוכל, Games=משחקים.
${tutorName ? `- The learner calls you "${tutorName}". Introduce and refer to yourself as ${tutorName} while staying in character.` : ""}

ADAPTIVE DIFFICULTY (every reply):
- Match vocabulary complexity, sentence length, and grammar corrections to age ${age} and skill ${level}.
- If they use English correctly: celebrate specifically (tense, vocabulary, a full sentence) — then keep chatting.
- If they struggle (very short answers, many errors, Hebrew only): gently scaffold — offer a starter they can complete, model 1 clear sentence, then invite them to try.
- Never talk over their head, and never baby them if they are doing well.

${formatMemoriesForPrompt(extras?.memories ?? [])}
${
  extras?.isFirstSessionToday
    ? "FIRST SESSION TODAY: If a memory is timely, open or continue with a natural callback before moving on."
    : ""
}

Personalize: prefer follow-up questions about their interests. Keep vocabulary matched to their level.`;
}
