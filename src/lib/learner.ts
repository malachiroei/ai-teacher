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
    placement_completed: "placement_completed" in profile ? Boolean(profile.placement_completed) : undefined,
    xp: "xp" in profile ? Number(profile.xp) || 0 : undefined,
    level: "level" in profile ? Number(profile.level) || 1 : undefined,
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
  if (!Number.isFinite(age) || age <= 0) return "young child (6–13): tiny words, 1–2 short sentences, lots of warmth";
  if (age <= 8) return "young child: very simple words, one short sentence, lots of encouragement";
  if (age <= 10) return "ages 9–10: simple A1 English, short questions, playful tone";
  if (age <= 13) return "ages 11–13: still beginner-friendly, short sentences, no slang";
  return "young teen: keep it warm, simple, and age-safe";
}

function skillGuidance(level: string) {
  if (level === "advanced") {
    return "still keep it kid-simple unless they clearly succeed with longer lines";
  }
  if (level === "intermediate") {
    return "A2: short everyday English, one idea at a time";
  }
  return "A1 beginner: 3–8 word sentences, copyable phrases, celebrate one-word answers";
}

export function buildLearnerContext(
  profile?: ProfileInput | null,
  extras?: { memories?: UserMemory[]; isFirstSessionToday?: boolean },
) {
  const memories = extras?.memories ?? [];
  const memoryBlock = formatMemoriesForPrompt(memories);
  if (!profile && !memoryBlock) return "";

  const pronouns =
    profile?.gender === "girl" ? "she/her" : profile?.gender === "boy" ? "he/him" : "they/them";
  const hebrew = hebrewTranslationGuide(profile?.gender);
  const level = String(profile?.english_level || profile?.englishLevel || "beginner");
  const vocab = skillGuidance(level);
  const englishName = englishDisplayName(profile) || "friend";
  const pronounced = namePronunciation(profile);
  const age = Number(profile?.age) || 8;
  const tutorName = String(profile?.custom_tutor_name ?? "").trim();
  const interests = Array.isArray(profile?.interests)
    ? profile.interests.join(", ")
    : profile?.interests || "games, animals, and fun everyday things";

  const nameLine = pronounced
    ? `The child's name is ${englishName} (pronounced ${pronounced}). Always use this name. Never misspell it.`
    : `The child's name is ${englishName}. Always use this name. Never misspell it.`;

  const profileBlock = profile
    ? `COMPLETE KID PROFILE (use every line):
- ${nameLine}
- Age: ${age} — ${ageBand(age)}
- Gender: ${profile.gender ?? "unknown"} (English pronouns ${pronouns})
- Hebrew address: ${hebrew}
- English comfort: ${level} (${vocab})
- Hobbies / favorites: ${interests}
${tutorName ? `- They call you "${tutorName}". You are ${tutorName}, their best friend.` : ""}`
    : "KID PROFILE: still learning their details. Use memories below.";

  return `${profileBlock}

YOU ARE THEIR BEST FRIEND:
- Remember every detail they have ever told you: pets, hobbies, favorite games, family, school plans, friends, mood.
- Proactively bring up past memories and follow up on plans.
- Short, energetic, simple English. 1–2 sentences. Always end with a fun easy question.
- Celebrate everything they say. Make them excited to talk to you every day.
- After you know them, NEVER restart name/age/favorite quizzes. Ask about what they JUST said or a real memory.

${memoryBlock}
${
  extras?.isFirstSessionToday
    ? "FIRST SESSION TODAY: Greet them instantly like you missed them. Reference their latest memory or ask about their day. Do not wait for them to start. Do not restart the name quiz if you already know them."
    : ""
}`;
}
