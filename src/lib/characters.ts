import type { Profile } from "@/lib/supabase/types";
import { translateInterest } from "@/lib/hebrew";

export type CharacterId = "emma" | "alex";

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

/** Maps removed tutors to the closest active avatar/voice. */
const LEGACY_CHARACTER_MAP: Record<string, CharacterId> = {
  luna: "emma",
  mia: "emma",
  zoey: "emma",
  leo: "alex",
  max: "alex",
  nova: "alex",
};

function portrait(id: CharacterId) {
  return `/avatars/${id}.png`;
}

export const CHARACTERS: Character[] = [
  {
    id: "emma",
    name: "Emma",
    title: "Friendly Guide",
    tag: "ENGLISH BUDDY",
    shortDescription: "Patient, encouraging, and fun — loves talking about daily life, stories, and ideas.",
    avatarUrl: portrait("emma"),
    portraitUrl: portrait("emma"),
    accentColor: "#8B7CFF",
    voice: {
      gender: "female",
      pitch: 1.08,
      rate: 0.95,
      preferredNames: ["Samantha", "Victoria", "en-US-Neural2-F", "en-US-Wavenet-F", "Google US English", "Karen"],
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
    id: "alex",
    name: "Alex",
    title: "Teammate",
    tag: "SPORTS & GAMES BUDDY",
    shortDescription: "High energy and enthusiastic — loves sports, gaming, challenges, and action.",
    avatarUrl: portrait("alex"),
    portraitUrl: portrait("alex"),
    accentColor: "#FF9A1F",
    voice: {
      gender: "male",
      pitch: 0.92,
      rate: 1.0,
      preferredNames: ["Daniel", "David", "Arthur", "en-US-Neural2-D", "en-US-Wavenet-D", "Google UK English Male", "en-us-x-sfg-local", "Alex"],
    },
    greetingTemplate:
      "Hey{{nameBit}}! I'm {{tutorName}} — let's have some fun in English.{{topic}} How's your day going so far?",
    greetingTranslationTemplate:
      "היי{{nameBit}}! אני {{tutorName}} — בואו נדבר אנגלית בכיף.{{topicHe}} מה קורה איתך היום?",
    topicSentence: " I saw you like {{topicEn}} — that's champion energy.",
    systemPrompt: `CHARACTER PERSONA — you ARE Alex, "The Athlete", for Hebrew-speaking learners aged 6–13.
Talk like a pumped, encouraging teammate-coach: energetic, positive, short sentences.
You love basketball, soccer, tennis, workouts, and team sports — bring them in only when the child brings up sports or it truly fits.
On simple greetings (hi/hello/hey), do NOT ask about sports. Ask about their day, something fun they did, or a game/movie/song instead.
Use light sports talk (warm-up, team, practice, game day, fair play, let's go) only when the topic is already sports.
Use 1–2 sporty emojis when it feels natural (🏀 ⚽ 💪 🏆). Never spam.
Cheer effort, not only winning. You still correct grammar kindly, keep replies 1–3 sentences, and always ask a follow-up question.
Stay age-appropriate. No body-shaming, no extreme training pressure.`,
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
  /samantha|victoria|karen|moira|tessa|zira|hazel|fiona|kathy|siri|nicky|jenny|aria|eva|sfg#female|female|woman|girl|us english female|uk english female|google us english(?! male)|neural2-[af]|wavenet-[afc]/i;
const MALE_VOICE_HINT =
  /daniel|fred|david|mark|arthur|\btom\b|oliver|aaron|rishi|ravi|george|thomas|james|tony|echo|onyx|\balex\b|male_1|#male|\biol\b|male|man|\bguy\b|\bboy\b|us english male|uk english male|en-us-x-tpd|neural2-[dj]|wavenet-[dj]|standard-[bcdj]/i;
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
