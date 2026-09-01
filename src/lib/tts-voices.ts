import type { Character, CharacterId } from "@/lib/characters";
import { resolveCharacterId } from "@/lib/characters";
import { hasHebrewScript } from "@/lib/language";

/** Kid-friendly Microsoft Edge neural voices (no API key required). */
export const ENGLISH_NEURAL_VOICES = [
  "en-US-AnaNeural",
  "en-US-JennyNeural",
  "en-US-ChristopherNeural",
  "en-US-GuyNeural",
  "en-US-AriaNeural",
] as const;

export const HEBREW_NEURAL_VOICES = ["he-IL-AvriNeural", "he-IL-HilaNeural"] as const;

export const NEURAL_TTS_VOICES = [...ENGLISH_NEURAL_VOICES, ...HEBREW_NEURAL_VOICES] as const;

export type NeuralTtsVoice = (typeof NEURAL_TTS_VOICES)[number];

const CHARACTER_ENGLISH_VOICE: Record<CharacterId, NeuralTtsVoice> = {
  emma: "en-US-JennyNeural",
  alex: "en-US-ChristopherNeural",
  leo: "en-US-ChristopherNeural",
  maya: "en-US-AnaNeural",
  kai: "en-US-ChristopherNeural",
  chloe: "en-US-AnaNeural",
};

/** Kid-friendly pacing — slightly slower for clear pronunciation. */
export const NEURAL_DEFAULT_SPEED = 0.95;

const NEURAL_VOICE_SET = new Set<string>(NEURAL_TTS_VOICES);

export function isAllowedNeuralVoice(value: string | null | undefined): value is NeuralTtsVoice {
  return Boolean(value && NEURAL_VOICE_SET.has(value));
}

export function hebrewNeuralVoice(gender: "female" | "male" = "male"): NeuralTtsVoice {
  return gender === "female" ? "he-IL-HilaNeural" : "he-IL-AvriNeural";
}

export function englishNeuralVoiceForCharacter(character?: Character | null): NeuralTtsVoice {
  const id = resolveCharacterId(character?.id);
  return CHARACTER_ENGLISH_VOICE[id] ?? "en-US-JennyNeural";
}

/** Pick Edge TTS voice from text language + tutor gender. */
export function neuralVoiceForText(text: string, character?: Character | null): NeuralTtsVoice {
  if (hasHebrewScript(text)) {
    return hebrewNeuralVoice(character?.voice.gender ?? "male");
  }
  return englishNeuralVoiceForCharacter(character);
}

export function resolveNeuralVoice(voice?: string | null, text?: string | null): NeuralTtsVoice {
  if (isAllowedNeuralVoice(voice)) return voice;
  if (voice && /^(en-US|he-IL)-[A-Za-z]+Neural$/.test(voice)) return voice as NeuralTtsVoice;
  if (text?.trim() && hasHebrewScript(text)) return "he-IL-AvriNeural";
  return "en-US-JennyNeural";
}

/** @deprecated Use englishNeuralVoiceForCharacter or neuralVoiceForText */
export function neuralVoiceForCharacter(character?: Character | null): NeuralTtsVoice {
  return englishNeuralVoiceForCharacter(character);
}

export function neuralSpeedForCharacter(_character?: Character | null, speedMultiplier = 1) {
  const raw = NEURAL_DEFAULT_SPEED * speedMultiplier;
  return clampNeuralSpeed(raw);
}

export function clampNeuralSpeed(speed?: number | null) {
  if (speed == null || !Number.isFinite(speed)) return NEURAL_DEFAULT_SPEED;
  return Math.min(1.05, Math.max(0.85, speed));
}
