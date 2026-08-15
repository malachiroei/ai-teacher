import type { Profile, ProfileInput } from "@/lib/supabase/types";
import type { Message } from "@/types/chat";
import { buildCharacterGreeting, getCharacter } from "@/lib/characters";
import { hebrewTranslationGuide } from "@/lib/hebrew";

export const INTEREST_OPTIONS = ["Movies", "Cars", "Travel", "Sports", "Tech", "Music", "Food", "Games"] as const;

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
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
  return {
    nickname,
    name: fullName || nickname,
    age: profile.age,
    gender: profile.gender,
    english_level: profile.english_level,
    englishLevel: profile.english_level,
    interests,
    selected_character: "selected_character" in profile ? profile.selected_character : undefined,
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

export function buildLearnerContext(profile?: ProfileInput | null) {
  if (!profile) return "";

  const pronouns =
    profile.gender === "girl" ? "she/her" : profile.gender === "boy" ? "he/him" : "they/them";
  const hebrew = hebrewTranslationGuide(profile.gender);
  const vocab =
    profile.english_level === "beginner" || profile.englishLevel === "beginner"
      ? "A1–A2: very simple words, short sentences, repeat key phrases"
      : profile.english_level === "advanced" || profile.englishLevel === "advanced"
        ? "B2–C1: natural, native-like English, still warm and supportive"
        : "B1: clear everyday English, a little challenge is OK";

  return `LEARNER PROFILE (always use this):
- Name: ${profile.nickname || profile.name || "learner"} — use it naturally, not in every sentence
- Age: ${profile.age}
- Gender: ${profile.gender} (English pronouns ${pronouns})
- Hebrew address: ${hebrew}
- English level: ${profile.english_level || profile.englishLevel || "beginner"} (${vocab})
- Interests: ${
    Array.isArray(profile.interests)
      ? profile.interests.join(", ")
      : profile.interests || "everyday topics"
  }
- Interest nouns in Hebrew: Movies=סרטים, Cars=מכוניות, Travel=טיולים, Sports=ספורט, Tech=טכנולוגיה, Music=מוזיקה, Food=אוכל, Games=משחקים.

Personalize: prefer follow-up questions about their interests. Keep vocabulary matched to their level.`;
}
