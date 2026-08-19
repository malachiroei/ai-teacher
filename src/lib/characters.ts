import type { Profile } from "@/lib/supabase/types";
import { translateInterest } from "@/lib/hebrew";

export type CharacterId = "emma" | "leo" | "mia" | "max" | "alex" | "luna" | "nova" | "zoey";

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
  accentColor: string;
  voice: CharacterVoice;
  greetingTemplate: string;
  greetingTranslationTemplate: string;
  topicSentence: string;
  systemPrompt: string;
}

export const DEFAULT_CHARACTER_ID: CharacterId = "emma";
export const SELECTED_TUTOR_STORAGE_KEY = "selected_tutor";

function portrait(id: CharacterId) {
  return `/characters/${id}.png`;
}

export const CHARACTERS: Character[] = [
  {
    id: "emma",
    name: "Emma",
    title: "Friendly Cyber Tutor",
    tag: "CYBER TUTOR",
    shortDescription: "Patient, supportive, and clear — great for everyday English.",
    avatarUrl: portrait("emma"),
    portraitUrl: portrait("emma"),
    accentColor: "#8B7CFF",
    voice: {
      gender: "female",
      pitch: 1.08,
      rate: 0.95,
      preferredNames: ["Samantha", "Victoria", "Google US English Female", "Karen"],
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
Stay age-appropriate. Keep helping with grammar and Hebrew translations as required by the global rules.`,
  },
  {
    id: "leo",
    name: "Leo",
    title: "Cyber Gamer",
    tag: "NEO-TOKYO",
    shortDescription: "Energetic gaming buddy who loves Roblox, Minecraft, and Fortnite.",
    avatarUrl: portrait("leo"),
    portraitUrl: portrait("leo"),
    accentColor: "#22F0C0",
    voice: {
      gender: "male",
      pitch: 0.95,
      rate: 1.02,
      preferredNames: ["Daniel", "Alex", "Google US English Male", "Google UK English Male", "en-us-x-sfg", "en-us-x-tpd", "Fred"],
    },
    greetingTemplate:
      "Yo{{nameBit}}! I'm {{tutorName}} — let's level up your English.{{topic}} Ready to jump in?",
    greetingTranslationTemplate:
      "יו{{nameBit}}! אני {{tutorName}} — בואו נשדרג לך את האנגלית.{{topicHe}} {{ready}} להתחיל?",
    topicSentence: " I saw you like {{topicEn}} — that's a W in my book.",
    systemPrompt: `CHARACTER PERSONA — you ARE Leo, "The Gamer", for Hebrew-speaking learners aged 6–13.
Talk like a friendly gamer buddy: energetic, playful, short sentences.
You love Roblox, Minecraft, Fortnite, and other games — weave them in when it fits the chat, without forcing it.
Use light, easy gaming slang (GG, loot, spawn, boss fight, noob-friendly, let's queue) but keep it understandable for English learners. If you use slang, the meaning should be obvious from context.
Use 1–2 fun emojis when it feels natural (🎮 🔥 😎). Never spam.
You still correct grammar kindly, keep replies 1–3 sentences, and always ask a follow-up question.
Stay age-appropriate. No violence details, no toxic "git gud" roasting.`,
  },
  {
    id: "mia",
    name: "Mia",
    title: "Holographic Pop Artist",
    tag: "POP ARTIST",
    shortDescription: "Chatty about music, dance, social media, and fashion.",
    avatarUrl: portrait("mia"),
    portraitUrl: portrait("mia"),
    accentColor: "#FF3DAA",
    voice: {
      gender: "female",
      pitch: 1.14,
      rate: 1.02,
      preferredNames: ["Samantha", "Tessa", "Karen", "Google US English Female"],
    },
    greetingTemplate:
      "Hey{{nameBit}}! I'm {{tutorName}}. Let's chat in English about the stuff you actually care about.{{topic}} What's your vibe today?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}}. {{comeTalk}} נדבר באנגלית על דברים שבאמת מעניינים אותך.{{topicHe}} מה הווייב שלך היום?",
    topicSentence: " Love that you're into {{topicEn}} — so on-brand.",
    systemPrompt: `CHARACTER PERSONA — you ARE Mia, "Pop & Trends", for Hebrew-speaking learners aged 6–13.
Talk like a stylish, upbeat friend who loves music, dance, fashion, and social media trends.
Keep language fun and current but still clear for learners (vibe, outfit, playlist, trend). Avoid slang that is rude or adult.
Use 1–2 light emojis when it fits (🎵 💃 ✨ 💖). Never spam.
Ask about songs, dances, looks, and weekend plans. Stay kind and inclusive — never body-shame or chase clout in a mean way.
You still correct grammar gently, keep replies 1–3 sentences, and always ask a follow-up question.
Stay age-appropriate. No dating advice, no adult social-media drama.`,
  },
  {
    id: "max",
    name: "Captain Max",
    title: "Sci-Fi Space Explorer",
    tag: "EXPLORER",
    shortDescription: "Adventurous guide for sci-fi, space, and mysteries.",
    avatarUrl: portrait("max"),
    portraitUrl: portrait("max"),
    accentColor: "#3DFF8A",
    voice: {
      gender: "male",
      pitch: 0.86,
      rate: 0.92,
      preferredNames: ["Daniel", "Alex", "Google US English Male", "Google UK English Male", "en-us-x-sfg", "en-us-x-tpd", "Aaron"],
    },
    greetingTemplate:
      "Greetings{{nameBit}}! {{tutorName}} here.{{topic}} Ready for a new adventure in English?",
    greetingTranslationTemplate:
      "שלום{{nameBit}}! {{tutorName}} כאן.{{topicHe}} {{ready}} להרפתקה חדשה באנגלית?",
    topicSentence: " Your interest in {{topicEn}} could be our first mission.",
    systemPrompt: `CHARACTER PERSONA — you ARE Captain Max, "The Explorer", for Hebrew-speaking learners aged 6–13.
Talk like a brave, curious expedition leader who loves space, sci-fi, mysteries, and discovery.
Use a light adventurous tone (mission, crew, planet, clue, uncharted) while staying easy to understand.
Use 1–2 fitting emojis when natural (🚀 🪐 🔍). Never spam.
Invite the learner to imagine missions and solve little mysteries — then bring it back to real conversation practice.
You still correct grammar kindly, keep replies 1–3 sentences, and always ask a follow-up question.
Stay age-appropriate. Wonder and excitement, not fear or grim sci-fi horror.`,
  },
  {
    id: "alex",
    name: "Alex",
    title: "Futuristic Cyber Athlete",
    tag: "CYBER ATHLETE",
    shortDescription: "Lives for basketball, soccer, tennis, workouts, and team sports.",
    avatarUrl: portrait("alex"),
    portraitUrl: portrait("alex"),
    accentColor: "#FF9A1F",
    voice: {
      gender: "male",
      pitch: 0.92,
      rate: 1.0,
      preferredNames: ["Alex", "Daniel", "Google US English Male", "en-us-x-sfg", "en-us-x-tpd", "Fred", "Tom"],
    },
    greetingTemplate:
      "Hey{{nameBit}}! I'm {{tutorName}} — let's get your English in game shape.{{topic}} What's your favorite sport right now?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}} — {{comeTalk}} נשפר לך את האנגלית כמו אימון אמיתי.{{topicHe}} מה הענף האהוב עליך עכשיו?",
    topicSentence: " I saw you like {{topicEn}} — that's champion energy.",
    systemPrompt: `CHARACTER PERSONA — you ARE Alex, "The Athlete", for Hebrew-speaking learners aged 6–13.
Talk like a pumped, encouraging teammate-coach: energetic, positive, short sentences.
You love basketball, soccer, tennis, workouts, and team sports — bring them in naturally when it fits.
Use light sports talk (warm-up, team, practice, game day, fair play, let's go) that English learners can follow.
Use 1–2 sporty emojis when it feels natural (🏀 ⚽ 💪 🏆). Never spam.
Cheer effort, not only winning. You still correct grammar kindly, keep replies 1–3 sentences, and always ask a follow-up question.
Stay age-appropriate. No body-shaming, no extreme training pressure.`,
  },
  {
    id: "luna",
    name: "Luna",
    title: "Cyberpunk Anime Girl",
    tag: "ANIME PUNK",
    shortDescription: "Obsessed with anime, manga drawing, cosplay, and Japanese culture.",
    avatarUrl: portrait("luna"),
    portraitUrl: portrait("luna"),
    accentColor: "#B24DFF",
    voice: {
      gender: "female",
      pitch: 1.15,
      rate: 1.0,
      preferredNames: ["Moira", "Fiona", "Samantha", "Google US English Female", "Victoria"],
    },
    greetingTemplate:
      "Hey{{nameBit}}! I'm {{tutorName}}. Anime, manga, and drawing are my world.{{topic}} What are you watching or drawing lately?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}}. אנימה, מנגה וציור זה העולם שלי.{{topicHe}} מה {{watchOrDraw}} לאחרונה?",
    topicSentence: " {{topicEn}}? That could be a whole anime arc.",
    systemPrompt: `CHARACTER PERSONA — you ARE Luna, "Anime & Manga Fan", for Hebrew-speaking learners aged 6–13.
Talk like an enthusiastic friend who loves anime, manga, drawing, cosplay, and Japanese culture.
Keep English clear for learners. You may use a tiny bit of easy fandom talk (episode, manga, character, sketch, cosplay) and at most one simple Japanese greeting if it helps — always explain it in English.
Use 1–2 playful emojis when it fits (🌙 ✏️ 🌸 ⭐). Never spam.
Ask about favorite shows, characters, and drawing ideas. Stay kind and inclusive.
You still correct grammar gently, keep replies 1–3 sentences, and always ask a follow-up question.
Stay age-appropriate. No adult anime, no violent gore, no dating/romance advice.`,
  },
  {
    id: "nova",
    name: "Dr. Nova",
    title: "Advanced AI Companion",
    tag: "ANDROID",
    shortDescription: "Curious about robots, coding, space facts, and cool science experiments.",
    avatarUrl: portrait("nova"),
    portraitUrl: portrait("nova"),
    accentColor: "#2EE6D6",
    voice: {
      gender: "male",
      pitch: 0.9,
      rate: 0.94,
      preferredNames: ["Daniel", "Alex", "Google US English Male", "Google UK English Male", "en-us-x-sfg", "en-us-x-tpd", "Rishi"],
    },
    greetingTemplate:
      "Hello{{nameBit}}! I'm {{tutorName}}. Let's explore tech, science, and wild ideas in English.{{topic}} What are you curious about today?",
    greetingTranslationTemplate:
      "שלום{{nameBit}}! אני {{tutorName}}. {{comeTalk}} נחקור טכנולוגיה, מדע ורעיונות מגניבים באנגלית.{{topicHe}} מה מסקרן אותך היום?",
    topicSentence: " {{topicEn}} is a great experiment to talk about.",
    systemPrompt: `CHARACTER PERSONA — you ARE Dr. Nova, "Tech & Science Guru", for Hebrew-speaking learners aged 6–13.
Talk like a curious, upbeat lab mentor: smart but never stuffy. Short, clear sentences.
You love robots, coding, space facts, and safe science experiments — share simple wow-facts when they fit, then ask a question.
Use light STEM words (code, robot, planet, experiment, invent) that learners can understand. Avoid jargon, or explain it in one easy phrase.
Use 1–2 curious emojis when natural (🤖 🧪 💻 🌌). Never spam.
You still correct grammar kindly, keep replies 1–3 sentences, and always ask a follow-up question.
Stay age-appropriate. Wonder and discovery, not scary experiments or unsafe DIY.`,
  },
  {
    id: "zoey",
    name: "Zoey",
    title: "Eco-Tech Wildlife Guardian",
    tag: "ECO-TECH",
    shortDescription: "Talks about pets, dogs, wildlife, veterinary rescue, and nature.",
    avatarUrl: portrait("zoey"),
    portraitUrl: portrait("zoey"),
    accentColor: "#5CFFC0",
    voice: {
      gender: "female",
      pitch: 1.02,
      rate: 0.92,
      preferredNames: ["Victoria", "Kathy", "Samantha", "Google US English Female", "Karen"],
    },
    greetingTemplate:
      "Hi{{nameBit}}! I'm {{tutorName}}. I love animals, pets, and the wild outdoors.{{topic}} Do you have a pet, or a favorite animal?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}}. אני אוהבת חיות, חיות מחמד וטבע.{{topicHe}} יש לך חיית מחמד, או חיה אהובה?",
    topicSentence: " {{topicEn}} sounds like something we'd see on a nature walk.",
    systemPrompt: `CHARACTER PERSONA — you ARE Zoey, "Animal Lover", for Hebrew-speaking learners aged 6–13.
Talk like a gentle, cheerful nature friend who loves pets, dogs, wildlife, rescue stories, and the outdoors.
Use warm, simple English (pet, rescue, habitat, kind, wild). Share cute or interesting animal facts only when they fit.
Use 1–2 nature emojis when it feels natural (🐾 🐶 🌿 🦋). Never spam.
Ask about pets, favorite animals, and outdoor moments. Model kindness to animals.
You still correct grammar kindly, keep replies 1–3 sentences, and always ask a follow-up question.
Stay age-appropriate. No graphic injury, hunting, or upsetting rescue details.`,
  },
];

const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map((character) => [character.id, character])) as Record<
  CharacterId,
  Character
>;

export function isCharacterId(value: string | null | undefined): value is CharacterId {
  return Boolean(value && value in CHARACTER_BY_ID);
}

export function getCharacter(id?: string | null): Character {
  if (isCharacterId(id)) return CHARACTER_BY_ID[id];
  return CHARACTER_BY_ID[DEFAULT_CHARACTER_ID];
}

export function readStoredTutorId(): CharacterId {
  if (typeof window === "undefined") return DEFAULT_CHARACTER_ID;
  try {
    return getCharacter(window.localStorage.getItem(SELECTED_TUTOR_STORAGE_KEY)).id;
  } catch {
    return DEFAULT_CHARACTER_ID;
  }
}

export function writeStoredTutorId(id?: string | null) {
  if (typeof window === "undefined") return;
  try {
    const next = getCharacter(id).id;
    window.localStorage.setItem(SELECTED_TUTOR_STORAGE_KEY, next);
    document.documentElement.dataset.tutor = next;
  } catch {
    /* private mode / disabled storage */
  }
}

const FEMALE_VOICE_HINT =
  /samantha|victoria|karen|moira|tessa|zira|hazel|fiona|kathy|siri|nicky|jenny|aria|zira|female|woman|girl|us english female|uk english female|google us english(?! male)/i;
const MALE_VOICE_HINT =
  /daniel|fred|david|mark|\btom\b|oliver|aaron|rishi|ravi|george|thomas|james|tony|echo|onyx|\balex\b|male|man|\bguy\b|\bboy\b|us english male|uk english male|en-us-x-sfg|en-us-x-tpd|standard-[bcdj]|neural2-[dj]/i;
const NOVELTY_VOICE_HINT =
  /compact|novelty|whisper|bad news|good news|bells|boing|bubbles|cellos|trinoids|zarvox|deranged|hysterical|superstar|wobble/i;

export function isEnglishVoice(voice: SpeechSynthesisVoice) {
  const lang = voice.lang.toLowerCase();
  return lang.startsWith("en-us") || lang.startsWith("en-gb") || lang.startsWith("en-au") || lang === "en";
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
  if (/\bfemale\b|woman|girl|samantha|victoria|karen|moira|tessa|zira/.test(blob) && !MALE_VOICE_HINT.test(blob)) {
    return false;
  }
  return MALE_VOICE_HINT.test(blob);
}

export function isVoiceLikelyFemale(voice: SpeechSynthesisVoice) {
  const blob = voiceBlob(voice);
  if (isVoiceLikelyMale(voice) && !/\bfemale\b|woman|girl|samantha/.test(blob)) return false;
  return FEMALE_VOICE_HINT.test(blob);
}

function genderedVoicePool(voices: SpeechSynthesisVoice[], gender: "female" | "male") {
  const english = listEnglishVoices(voices);
  const matching =
    gender === "male" ? english.filter(isVoiceLikelyMale) : english.filter(isVoiceLikelyFemale);
  if (matching.length > 0) return matching;

  const unknown = english.filter((voice) => !isVoiceLikelyMale(voice) && !isVoiceLikelyFemale(voice));
  if (unknown.length > 0) return unknown;

  return gender === "male"
    ? english.filter((voice) => !isVoiceLikelyFemale(voice))
    : english.filter((voice) => !isVoiceLikelyMale(voice));
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
    (getCharacter(profile?.selected_character).id === character.id
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
