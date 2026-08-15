import type { Profile, ProfileInput } from "@/lib/supabase/types";
import type { Message } from "@/types/chat";
import { hebrewTranslationGuide, translateInterest } from "@/lib/hebrew";

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
  };
}

export function buildWelcomeMessage(profile?: Profile | null): Message {
  if (!profile) {
    return {
      id: createId(),
      sender: "ai",
      text: "Hi! I'm Emma, your English conversation partner. How are you doing today? Type a reply or tap the mic and speak.",
      timestamp: Date.now(),
      translation:
        "היי! אני אמה, שותפת השיחה שלך באנגלית. מה שלומך היום? אפשר להקליד תשובה או ללחוץ על המיקרופון ולדבר.",
    };
  }

  const name = profile.nickname.trim();
  const topic = profile.interests[0];
  const topicEn = topic ? topic.toLowerCase() : "";
  const topicHe = translateInterest(topic);

  const englishTopicBit = topic
    ? ` I saw that you like ${topicEn}. We can talk about that anytime.`
    : "";

  let translation: string;
  if (!topicHe) {
    translation = `היי ${name}! אני אמה, שותפת השיחה שלך באנגלית. מה שלומך היום?`;
  } else if (profile.gender === "girl") {
    translation = `היי ${name}! אני אמה, שותפת השיחה שלך באנגלית. ראיתי שאת אוהבת ${topicHe} – נוכל לדבר על זה בכל זמן. מה שלומך היום?`;
  } else if (profile.gender === "other") {
    translation = `היי ${name}! אני אמה, שותפת השיחה שלך באנגלית. ראיתי שיש לך עניין ב${topicHe} – נוכל לדבר על זה בכל זמן. מה שלומך היום?`;
  } else {
    translation = `היי ${name}! אני אמה, שותפת השיחה שלך באנגלית. ראיתי שאתה אוהב ${topicHe} – נוכל לדבר על זה בכל זמן. מה שלומך היום?`;
  }

  return {
    id: createId(),
    sender: "ai",
    text: `Hi ${name}! I'm Emma, your English conversation partner.${englishTopicBit} How are you doing today?`,
    timestamp: Date.now(),
    translation,
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
