import type { Profile } from "@/lib/supabase/types";
import { translateInterest } from "@/lib/hebrew";

export type CharacterId = "emma" | "alex" | "leo" | "maya" | "kai" | "chloe";

export interface CharacterVoice {
  gender: "female" | "male";
  pitch: number;
  rate: number;
  preferredNames: string[];
}

export interface Character {
  id: CharacterId;
  name: string;
  title: string;
  tag: string;
  shortDescription: string;
  avatarUrl: string;
  portraitUrl?: string;
  modelUrl: string;
  accentColor: string;
  voice: CharacterVoice;
  greetingTemplate: string;
  greetingTranslationTemplate: string;
  topicSentence: string;
  systemPrompt: string;
}

export const CONVERSATION_SPARK = `
CONVERSATION SPARK:
- 1–2 short sentences max so kids stay eager to speak.
- Open with a tiny funny 1-sentence anecdote about YOU, then one imaginative question.
- Prefer Would You Rather, superhero dilemmas, amusement-park builds, spaceship naming, mini-mysteries.
- Examples: "If you could fly or turn invisible for one day, which would you pick?" / "We're building a wild amusement park — what crazy rollercoaster first?" / "You're captain of a ship at a purple planet. What do we name it?"
- BANNED as default questions: "What movie do you like?", "What song do you like?", "What's your favorite movie/song/game?"
`;

export const DEFAULT_CHARACTER_ID: CharacterId = "emma";
export const SELECTED_TUTOR_STORAGE_KEY = "selected_tutor";

/** Maps removed tutors to the closest active avatar/voice. */
const LEGACY_CHARACTER_MAP: Record<string, CharacterId> = {
  luna: "emma",
  mia: "emma",
  zoey: "emma",
  max: "alex",
  nova: "alex",
};

function portrait(id: CharacterId) {
  return `/avatars/${id}.png?v=real3d_v1`;
}

export const CHARACTERS: Character[] = [
  {
    id: "emma",
    name: "Emma",
    title: "Friendly Robot Buddy",
    tag: "KID GUIDE",
    shortDescription: "A warm Pixar-style robot buddy who makes English feel easy and fun.",
    avatarUrl: portrait("emma"),
    portraitUrl: portrait("emma"),
    modelUrl: "/models/emma.glb?v=v_final_new",
    accentColor: "#8B7CFF",
    voice: {
      gender: "female",
      pitch: 1.08,
      rate: 0.95,
      preferredNames: ["Samantha", "Victoria", "en-US-JennyNeural", "en-US-Neural2-F", "en-US-Wavenet-F", "Google US English", "Karen"],
    },
    greetingTemplate:
      "Hi{{nameBit}}! I'm {{tutorName}}, your friendly English tutor.{{topic}} How are you doing today?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}}, המורה החברה שלך לאנגלית.{{topicHe}} מה שלומך היום?",
    topicSentence: " I saw that you like {{topicEn}}. We can talk about that anytime.",
    systemPrompt: `CHARACTER PERSONA — you ARE Emma, "Friendly Tutor", for Hebrew-speaking learners aged 6–13.
Be warm, patient, and encouraging — like a kind older-sister tutor.
Use clear, everyday conversational English. Short sentences. Light, friendly emojis only when they help (🙂 ✨), never more than one per reply.
Explain ideas simply. Celebrate effort. Never sound like a strict teacher or a textbook.
Stay age-appropriate. Keep helping with grammar and Hebrew translations as required by the global rules.` + CONVERSATION_SPARK,
  },
  {
    id: "alex",
    name: "Alex",
    title: "Friendly Cyber Mentor",
    tag: "SPORTS HERO",
    shortDescription: "A vibrant cyberpunk teammate for games, sports, and brave English tries.",
    avatarUrl: portrait("alex"),
    portraitUrl: portrait("alex"),
    modelUrl: "/models/alex.glb?v=human_male_v2",
    accentColor: "#FF9A1F",
    voice: {
      gender: "male",
      pitch: 0.72,
      rate: 0.92,
      preferredNames: ["en-us-x-iol-network", "en-gb-x-rjs-local", "en-US-Wavenet-D", "en-US-Neural2-D", "Daniel", "David", "Arthur", "en-US-GuyNeural", "Google UK English Male", "Alex"],
    },
    greetingTemplate:
      "Hey{{nameBit}}! I'm {{tutorName}} — let's have some fun in English.{{topic}} How's your day going so far?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}} — בואו נדבר אנגלית בכיף.{{topicHe}} מה קורה איתך היום?",
    topicSentence: " I saw you like {{topicEn}} — that's champion energy.",
    systemPrompt: `CHARACTER PERSONA — you ARE Alex, "The Athlete", for Hebrew-speaking learners aged 6–13.
Talk like a pumped, encouraging teammate-coach: energetic, positive, short sentences.
You love basketball, soccer, tennis, workouts, and team sports — bring them in only when the child brings up sports or it truly fits.
On simple greetings (hi/hello/hey), do NOT ask about sports. Ask about their day or toss a Would You Rather / superhero dilemma.
Use light sports talk (warm-up, team, practice, game day, fair play, let's go) only when the topic is already sports.
Use 1–2 sporty emojis when it feels natural (🏀 ⚽ 💪 🏆). Never spam.
Cheer effort, not only winning. You still correct grammar kindly, keep replies 1–2 sentences, and always ask a follow-up question.
Stay age-appropriate. No body-shaming, no extreme training pressure.` + CONVERSATION_SPARK,
  },
  {
    id: "leo",
    name: "Leo",
    title: "Cute Space Explorer",
    tag: "SPACE EXPLORER",
    shortDescription: "A friendly Pixar-style explorer who loves stars, gadgets, and curious English missions.",
    avatarUrl: portrait("leo"),
    portraitUrl: portrait("leo"),
    modelUrl: "/models/leo.glb?v=look-v2",
    accentColor: "#3D9BFF",
    voice: {
      gender: "male",
      pitch: 0.72,
      rate: 0.92,
      preferredNames: ["en-us-x-iol-network", "en-gb-x-rjs-local", "en-US-Wavenet-D", "en-US-Neural2-D", "Matthew", "Brian", "Guy", "en-US-GuyNeural", "Google US English Male", "Daniel"],
    },
    greetingTemplate:
      "Hey{{nameBit}}! I'm {{tutorName}} — ready for a space-level English mission?{{topic}} How are you starting today?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}} — מוכנים למשימת אנגלית מהחלל?{{topicHe}} איך אתה מתחיל את היום?",
    topicSentence: " I saw you like {{topicEn}} — that is next-level cool.",
    systemPrompt: `CHARACTER PERSONA — you ARE Leo, "Space Explorer", for Hebrew-speaking learners aged 6–13.
Talk like an energetic tech-and-space buddy: curious, upbeat, short sentences, a little wow-factor.
You love astronomy, AI, gadgets, superheroes, planets, and future tech — weave them in only when the child is into it or it truly fits.
On simple greetings (hi/hello/hey), do NOT dump science facts. Share a tiny space anecdote, then a superpower or planet-naming question.
Use light space/tech talk (mission, launch, galaxy, robot, superpower) only when the topic already goes there.
Use 1 emoji when it helps (🚀 🌌 ⚡). Never spam.
Stay age-appropriate. You still correct grammar kindly, keep replies 1–2 sentences, and always ask a follow-up question.` + CONVERSATION_SPARK,
  },
  {
    id: "maya",
    name: "Maya",
    title: "Creative Vibes",
    tag: "CREATIVE VIBES",
    shortDescription: "Passionate about pop music, drawing, movies, acting, and creative storytelling.",
    avatarUrl: portrait("maya"),
    portraitUrl: portrait("maya"),
    modelUrl: "/models/maya.glb?v=look-v2",
    accentColor: "#FF5DA2",
    voice: {
      gender: "female",
      pitch: 1.12,
      rate: 0.97,
      preferredNames: ["Samantha", "Zira", "Jenny", "Aria", "en-US-JennyNeural", "en-US-Neural2-F", "en-US-Wavenet-C", "Google US English", "Karen"],
    },
    greetingTemplate:
      "Hi{{nameBit}}! I'm {{tutorName}} — let's make English feel like a song.{{topic}} How are you feeling today?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}} — בואי נעשה את האנגלית כמו שיר.{{topicHe}} איך את מרגישה היום?",
    topicSentence: " I saw you like {{topicEn}} — we can turn that into a story anytime.",
    systemPrompt: `CHARACTER PERSONA — you ARE Maya, "Creative Vibes", for Hebrew-speaking learners aged 6–13.
Talk like a warm, musical older-sister artist: kind, colorful, short sentences, a little sparkle.
You love pop music, drawing, movies, acting, and storytelling — bring them in only when the child is into art/music/stories or it truly fits.
On simple greetings, share a tiny art anecdote, then a creative Would You Rather — never "what song/movie do you like?"
Use light creative talk (beat, color, scene, story, stage) only when the topic already goes there.
Use 1 emoji when it helps (🎵 🎨 ✨). Never spam.
Stay age-appropriate. You still correct grammar kindly, keep replies 1–2 sentences, and always ask a follow-up question.` + CONVERSATION_SPARK,
  },
  {
    id: "kai",
    name: "Kai",
    title: "World Adventurer",
    tag: "WORLD ADVENTURER",
    shortDescription: "Enjoys world travel, wildlife, extreme sports, hiking, and exploring cool cultures.",
    avatarUrl: portrait("kai"),
    portraitUrl: portrait("kai"),
    modelUrl: "/models/kai.glb?v=look-v2",
    accentColor: "#22C55E",
    voice: {
      gender: "male",
      pitch: 0.72,
      rate: 0.92,
      preferredNames: ["en-us-x-iol-network", "en-gb-x-rjs-local", "en-US-Wavenet-D", "en-US-Neural2-D", "David", "Mark", "Ryan", "en-US-GuyNeural", "Google UK English Male", "Arthur"],
    },
    greetingTemplate:
      "Hey{{nameBit}}! I'm {{tutorName}} — adventure English starts now.{{topic}} What's the coolest thing in your day?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}} — הרפתקת האנגלית מתחילה.{{topicHe}} מה הדבר הכי מגניב ביום שלך?",
    topicSentence: " I saw you like {{topicEn}} — that sounds like a real adventure.",
    systemPrompt: `CHARACTER PERSONA — you ARE Kai, "World Adventurer", for Hebrew-speaking learners aged 6–13.
Talk like a cool outdoor trail buddy: calm-confident, curious, short sentences.
You love travel, wildlife, hiking, cultures, and (age-safe) adventure sports — bring them in only when the child is into nature/travel or it truly fits.
On simple greetings, ask about their day or toss an adventure Would You Rather — do not start with extreme sports.
Use light adventure talk (trail, map, wildlife, camp, culture) only when the topic already goes there.
Use 1 emoji when it helps (🌍 🦊 ⛰️). Never spam.
Stay age-appropriate. No real danger talk. You still correct grammar kindly, keep replies 1–2 sentences, and always ask a follow-up question.` + CONVERSATION_SPARK,
  },
  {
    id: "chloe",
    name: "Chloe",
    title: "Gaming Champ",
    tag: "GAMING CHAMP",
    shortDescription: "Obsessed with Roblox, Fortnite, Minecraft, anime, and epic game strategies.",
    avatarUrl: portrait("chloe"),
    portraitUrl: portrait("chloe"),
    modelUrl: "/models/chloe.glb?v=look-v2",
    accentColor: "#A855F7",
    voice: {
      gender: "female",
      pitch: 1.16,
      rate: 1.03,
      preferredNames: ["Samantha", "Zira", "Jenny", "en-US-JennyNeural", "en-US-Neural2-H", "en-US-Wavenet-F", "Google US English", "Moira"],
    },
    greetingTemplate:
      "Yo{{nameBit}}! I'm {{tutorName}} — English practice, player one.{{topic}} What are you playing today?",
    greetingTranslationTemplate:
      "יו{{nameBit}}! אני {{tutorName}} — תרגול אנגלית, שחקן אחד.{{topicHe}} במה את משחקת היום?",
    topicSentence: " I saw you like {{topicEn}} — that is a legendary pick.",
    systemPrompt: `CHARACTER PERSONA — you ARE Chloe, "Gaming Champ", for Hebrew-speaking learners aged 6–13.
Talk like a playful gamer friend: lively, kind, short sentences, a little hype.
You love Roblox, Fortnite, Minecraft, anime, and game strategy — bring them in only when the child is into games/anime or it truly fits.
On simple greetings, a light quest Would You Rather is ok, but do not dump a long game quiz or "what game/movie do you like?".
Use light gamer talk (level up, quest, combo, boss, squad) only when the topic already goes there. Keep it age-safe: no violence details.
Use 1 emoji when it helps (🎮 👾 ⭐). Never spam.
Stay age-appropriate. You still correct grammar kindly, keep replies 1–2 sentences, and always ask a follow-up question.` + CONVERSATION_SPARK,
  },
];

const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map((character) => [character.id, character])) as Record<
  CharacterId,
  Character
>;

export function isCharacterId(value: string | null | undefined): value is CharacterId {
  return Boolean(value && value in CHARACTER_BY_ID);
}

export function resolveCharacterId(id?: string | null): CharacterId {
  if (isCharacterId(id)) return id;
  if (id && id in LEGACY_CHARACTER_MAP) return LEGACY_CHARACTER_MAP[id];
  return DEFAULT_CHARACTER_ID;
}

export function getCharacter(id?: string | null): Character {
  return CHARACTER_BY_ID[resolveCharacterId(id)];
}

export function readStoredTutorId(): CharacterId {
  if (typeof window === "undefined") return DEFAULT_CHARACTER_ID;
  try {
    return resolveCharacterId(window.localStorage.getItem(SELECTED_TUTOR_STORAGE_KEY));
  } catch {
    return DEFAULT_CHARACTER_ID;
  }
}

export function writeStoredTutorId(id?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const next = resolveCharacterId(id);
    window.localStorage.setItem(SELECTED_TUTOR_STORAGE_KEY, next);
    document.documentElement.dataset.tutor = next;
  } catch {
    /* private mode / disabled storage */
  }
}

const FEMALE_VOICE_HINT =
  /samantha|victoria|karen|moira|tessa|zira|hazel|fiona|kathy|siri|nicky|jenny|aria|eva|sfg|female|woman|girl|us english female|uk english female|google us english(?! male)|jennyneural|en-us-jenny|neural2-[af]|wavenet-[afc]/i;
const MALE_VOICE_HINT =
  /daniel|fred|david|mark|arthur|\btom\b|oliver|aaron|rishi|ravi|george|thomas|james|tony|echo|onyx|\balex\b|male_1|#male|\biol\b|\brjs\b|male|man|\bguy\b|\bboy\b|us english male|uk english male|guyneural|en-us-guy|en-us-x-tpd|en-us-x-iol|en-gb-x-rjs|neural2-[dj]|wavenet-[dj]|standard-[bcdj]/i;
const NOVELTY_VOICE_HINT =
  /compact|novelty|whisper|bad news|good news|bells|boing|bubbles|cellos|trinoids|zarvox|deranged|hysterical|superstar|wobble/i;

export function isEnglishVoice(voice: SpeechSynthesisVoice) {
  const lang = (voice.lang || "").toLowerCase().replace(/_/g, "-");
  return lang.startsWith("en");
}

export function listEnglishVoices(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter(isEnglishVoice);
  const pool = english.length > 0 ? english : voices;
  return [...pool].sort((a, b) => a.name.localeCompare(b.name) || a.lang.localeCompare(b.lang));
}

function voiceBlob(voice: SpeechSynthesisVoice) {
  return `${voice.name} ${voice.voiceURI}`.toLowerCase();
}

export function isVoiceLikelyMale(voice: SpeechSynthesisVoice) {
  const blob = voiceBlob(voice);
  if (/\bsfg\b|sfg-|female|woman|girl|samantha|victoria|karen|moira|tessa|zira/.test(blob) && !/\bmale\b|\biol\b|\brjs\b|wavenet-d|neural2-d/.test(blob)) {
    return false;
  }
  return MALE_VOICE_HINT.test(blob);
}

export function isVoiceLikelyFemale(voice: SpeechSynthesisVoice) {
  const blob = voiceBlob(voice);
  if (isVoiceLikelyMale(voice) && !/\bfemale\b|woman|girl|samantha/.test(blob)) return false;
  return FEMALE_VOICE_HINT.test(blob);
}

/** True only when the engine voice is unambiguously the tutor's gender. */
export function voiceFitsRequiredGender(voice: SpeechSynthesisVoice, gender: "male" | "female") {
  if (gender === "male") return isVoiceLikelyMale(voice) && !isVoiceLikelyFemale(voice);
  return isVoiceLikelyFemale(voice) && !isVoiceLikelyMale(voice);
}

function genderedVoicePool(voices: SpeechSynthesisVoice[], gender: "female" | "male") {
  const english = listEnglishVoices(voices);
  return english.filter((voice) => voiceFitsRequiredGender(voice, gender));
}

export function findVoiceByUri(voices: SpeechSynthesisVoice[], uri?: string | null) {
  const needle = String(uri ?? "").trim();
  if (!needle) return null;
  return voices.find((voice) => voice.voiceURI === needle || voice.name === needle) ?? null;
}

function scoreVoice(voice: SpeechSynthesisVoice, character: Character) {
  const name = voiceBlob(voice);
  const lang = voice.lang.toLowerCase();
  let score = 0;

  if (lang.startsWith("en-us")) score += 5;
  else if (lang.startsWith("en-gb")) score += 3;
  else score += 1;

  for (const preferred of character.voice.preferredNames) {
    if (name.includes(preferred.toLowerCase())) score += 16;
  }

  if (character.voice.gender === "male") {
    if (isVoiceLikelyMale(voice)) score += 20;
    if (isVoiceLikelyFemale(voice)) score -= 80;
  } else {
    if (isVoiceLikelyFemale(voice)) score += 20;
    if (isVoiceLikelyMale(voice)) score -= 80;
  }

  if (NOVELTY_VOICE_HINT.test(name)) score -= 12;
  if (voice.localService) score += 2;
  return score;
}

export function pickCharacterVoice(voices: SpeechSynthesisVoice[], character?: Character | null) {
  const persona = character ?? getCharacter();
  const pool = genderedVoicePool(voices, persona.voice.gender);
  if (pool.length === 0) return null;
  return [...pool].sort((a, b) => scoreVoice(b, persona) - scoreVoice(a, persona))[0] ?? null;
}

function fill(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "");
}

function likeBit(gender: Profile["gender"] | undefined, topicHe: string) {
  if (!topicHe) return "";
  if (gender === "girl") return ` ראיתי שאת אוהבת ${topicHe}.`;
  if (gender === "other") return ` ראיתי שיש לך עניין ב${topicHe}.`;
  return ` ראיתי שאתה אוהב ${topicHe}.`;
}

function tutorNameFromProfile(character: Character, profile?: Profile | null) {
  const raw = profile?.tutor_nicknames;
  let map: Record<string, string> = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    map = Object.fromEntries(
      Object.entries(raw).map(([id, name]) => [id, String(name ?? "").trim()]),
    );
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      map = Object.fromEntries(
        Object.entries(parsed).map(([id, name]) => [id, String(name ?? "").trim()]),
      );
    } catch {
      map = {};
    }
  }
  return (
    map[character.id] ||
    (resolveCharacterId(profile?.selected_character) === character.id
      ? String(profile?.custom_tutor_name ?? "").trim()
      : "") ||
    character.name
  );
}

export function buildCharacterGreeting(
  character: Character,
  profile?: Profile | null,
): { text: string; translation: string } {
  const name = profile?.nickname?.trim() ?? "";
  const topic = profile?.interests?.[0];
  const topicEn = topic ? topic.toLowerCase() : "";
  const topicHe = translateInterest(topic);
  const nameBit = name ? ` ${name}` : "";
  const topicBit = topicEn ? fill(character.topicSentence, { topicEn }) : "";
  const gender = profile?.gender;
  const ready = gender === "girl" ? "מוכנה" : gender === "other" ? "מוכנים" : "מוכן";
  const comeTalk = gender === "girl" ? "בואי" : gender === "other" ? "בואו" : "בוא";
  const watchOrDraw =
    gender === "girl" ? "את צופה או מציירת" : gender === "other" ? "אתם צופים או מציירים" : "אתה צופה או מצייר";
  const tutorName = tutorNameFromProfile(character, profile);

  return {
    text: fill(character.greetingTemplate, { nameBit, topic: topicBit, tutorName }),
    translation: fill(character.greetingTranslationTemplate, {
      nameBit,
      topicHe: likeBit(gender, topicHe),
      ready,
      comeTalk,
      watchOrDraw,
      tutorName,
    }),
  };
}
