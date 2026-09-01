import type { Character, CharacterId } from "@/lib/characters";
import { resolveCharacterId } from "@/lib/characters";

/** Kid-friendly Microsoft Edge neural voices (no API key required). */
export const NEURAL_TTS_VOICES = [
  "en-US-AnaNeural",
  "en-US-JennyNeural",
  "en-US-ChristopherNeural",
  "en-US-GuyNeural",
  "en-US-AriaNeural",
] as const;

export type NeuralTtsVoice = (typeof NEURAL_TTS_VOICES)[number];

const CHARACTER_NEURAL_VOICE: Record<CharacterId, NeuralTtsVoice> = {
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

export function resolveNeuralVoice(voice?: string | null): NeuralTtsVoice {
  if (isAllowedNeuralVoice(voice)) return voice;
  if (voice && /^en-US-[A-Za-z]+Neural$/.test(voice)) return voice as NeuralTtsVoice;
  return "en-US-JennyNeural";
}

export function neuralVoiceForCharacter(character?: Character | null): NeuralTtsVoice {
  const id = resolveCharacterId(character?.id);
  return CHARACTER_NEURAL_VOICE[id] ?? "en-US-JennyNeural";
}

export function neuralSpeedForCharacter(_character?: Character | null, speedMultiplier = 1) {
  const raw = NEURAL_DEFAULT_SPEED * speedMultiplier;
  return clampNeuralSpeed(raw);
}

export function clampNeuralSpeed(speed?: number | null) {
  if (speed == null || !Number.isFinite(speed)) return NEURAL_DEFAULT_SPEED;
  return Math.min(1.05, Math.max(0.85, speed));
}
