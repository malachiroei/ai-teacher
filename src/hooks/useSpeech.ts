"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hasHebrewScript, type SpeechLang } from "@/lib/language";
import { findVoiceByUri, isVoiceLikelyFemale, isVoiceLikelyMale, listEnglishVoices, pickCharacterVoice, voiceFitsRequiredGender, type Character } from "@/lib/characters";

export const SPEECH_UNAVAILABLE_MESSAGE =
  "Speech recognition is not fully supported or microphone access was denied";

export const MIC_PERMISSION_MESSAGE = "Please allow microphone access in your browser settings";

const SILENCE_SUBMIT_MS = 1800;
const FINAL_SUBMIT_MS = 900;
const IDLE_LISTEN_CLOSE_MS = 3000;
const ONEND_RESULT_GRACE_MS = 300;

type RecognitionInstance = InstanceType<NonNullable<ReturnType<typeof getRecognitionConstructor>>>;

interface LangStream {
  text: string;
  confidence: number;
  running: boolean;
}

function getRecognitionConstructor() {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function isAppleTouchDevice() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return isAppleTouchDevice() || /Android|webOS|Mobile/i.test(navigator.userAgent);
}

function emptyStreams(): Record<SpeechLang, LangStream> {
  return {
    "en-US": { text: "", confidence: 0, running: false },
    "he-IL": { text: "", confidence: 0, running: false },
  };
}

function pickBestTranscript(streams: Record<SpeechLang, LangStream>) {
  // Prefer English-only transcripts for this English-practice product.
  const english = streams["en-US"].text.trim();
  if (english && !hasHebrewScript(english)) return english;
  if (english) return english;
  return streams["he-IL"].text.trim();
}

function readResultChunk(event: {
  resultIndex: number;
  results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string; confidence: number } } };
}) {
  let interim = "";
  let final = "";
  let confidence = 0;
  let sawFinal = false;

  for (let i = event.resultIndex; i < event.results.length; i += 1) {
    const result = event.results[i];
    const piece = result[0]?.transcript ?? "";
    confidence = result[0]?.confidence || confidence;
    if (result.isFinal) {
      final += piece;
      sawFinal = true;
    } else {
      interim += piece;
    }
  }

  return { interim, final, confidence, isFinal: sawFinal };
}

const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let unlockContext: AudioContext | null = null;
let voicePlayer: HTMLAudioElement | null = null;
let outputGain: GainNode | null = null;
let voicePlayerSource: MediaElementAudioSourceNode | null = null;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let currentOutputVolume = 1;
let speechUnlocked = false;
let resumeWatchId: number | null = null;
let cachedVoices: SpeechSynthesisVoice[] = [];

function collectVoices() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return cachedVoices;
  try {
    const next = window.speechSynthesis.getVoices();
    if (next.length > 0) cachedVoices = next;
  } catch {
    /* Android Chrome can throw before the engine is ready */
  }
  return cachedVoices;
}

function waitForVoices(timeoutMs = 1500) {
  const existing = collectVoices();
  if (existing.length > 0) return Promise.resolve(existing);

  return new Promise<SpeechSynthesisVoice[]>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      try {
        window.speechSynthesis.removeEventListener("voiceschanged", finish);
      } catch {
        /* ignore */
      }
      resolve(collectVoices());
    };

    try {
      if (typeof window.speechSynthesis.addEventListener === "function") {
        window.speechSynthesis.addEventListener("voiceschanged", finish);
      }
    } catch {
      /* some WebViews expose TTS without event support */
    }

    const timer = window.setTimeout(finish, timeoutMs);
  });
}

function resumeSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.resume();
  } catch {
    /* Chrome / iOS can pause the synth after async work */
  }
}

function ensureVoicePlayer() {
  if (typeof document === "undefined") return null;
  if (voicePlayer && document.contains(voicePlayer)) return voicePlayer;

  const existing = document.getElementById("ai-voice-player");
  if (existing instanceof HTMLAudioElement) {
    voicePlayer = existing;
  } else {
    voicePlayer = document.createElement("audio");
    voicePlayer.id = "ai-voice-player";
    document.body.appendChild(voicePlayer);
  }

  voicePlayer.setAttribute("playsinline", "true");
  voicePlayer.setAttribute("webkit-playsinline", "true");
  voicePlayer.setAttribute("preload", "auto");
  voicePlayer.controls = false;
  voicePlayer.autoplay = false;
  voicePlayer.muted = false;
  voicePlayer.defaultMuted = false;
  voicePlayer.volume = currentOutputVolume;
  voicePlayer.hidden = true;
  if (!voicePlayer.getAttribute("src")) {
    voicePlayer.src = SILENT_WAV;
  }
  return voicePlayer;
}

function unlockAudioContext() {
  if (typeof window === "undefined") return;
  try {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    if (!unlockContext) unlockContext = new Context();
    if (unlockContext.state === "suspended") {
      void unlockContext.resume();
    }
    const buffer = unlockContext.createBuffer(1, 1, unlockContext.sampleRate || 22050);
    const source = unlockContext.createBufferSource();
    source.buffer = buffer;
    source.connect(unlockContext.destination);
    source.start(0);
  } catch {
    /* WebViews may block AudioContext */
  }
}

function ensureOutputGain() {
  unlockAudioContext();
  if (!unlockContext) return null;
  if (!outputGain) {
    outputGain = unlockContext.createGain();
    outputGain.gain.value = currentOutputVolume;
    outputGain.connect(unlockContext.destination);
  }
  const player = ensureVoicePlayer();
  if (player && !voicePlayerSource) {
    try {
      voicePlayerSource = unlockContext.createMediaElementSource(player);
      voicePlayerSource.connect(outputGain);
    } catch {
      /* MediaElementSource can only be created once per element */
    }
  }
  return outputGain;
}

function applyOutputVolume(slider: number) {
  const val = Math.max(0, Math.min(1, slider));
  // SpeechSynthesis plays through the OS mixer, not our AudioContext.
  // Keep a linear 0–1 value for utterance.volume — a steep gain curve
  // made mid-slider positions sound muted.
  currentOutputVolume = val;
  if (activeUtterance) {
    try {
      activeUtterance.volume = val;
    } catch {
      /* Chrome often ignores mid-utterance volume; next chunk will pick it up. */
    }
  }
  if (voicePlayer) {
    try {
      voicePlayer.muted = val === 0;
      voicePlayer.defaultMuted = false;
      voicePlayer.volume = val;
    } catch {
      /* ignore */
    }
  }
  if (outputGain && unlockContext?.state === "running") {
    try {
      outputGain.gain.setValueAtTime(val, unlockContext.currentTime);
    } catch {
      try {
        outputGain.gain.value = val;
      } catch {
        /* ignore */
      }
    }
  }
}

export function getSpeechAudioContext() {
  unlockAudioContext();
  ensureOutputGain();
  return unlockContext;
}

// ─── Mic meter ────────────────────────────────────────────────────────────────
// IMPORTANT: We must NOT open a second getUserMedia() stream while
// webkitSpeechRecognition is running. On Android Chrome both calls compete for
// the hardware mic and recognition transcribes nothing.
//
// Strategy: drive the audio-level indicator using the *recognition event stream*
// (interim transcript changes act as a proxy for "voice is present") plus a
// lightweight sine-wave oscillator connected to the shared AudioContext.
// No getUserMedia is called by the meter — SpeechRecognition owns the mic.

type MicMeter = {
  raf: number;
  active: boolean;
};

const micMeter: MicMeter = { raf: 0, active: false };

function stopMicMeter() {
  if (micMeter.raf) {
    cancelAnimationFrame(micMeter.raf);
    micMeter.raf = 0;
  }
  micMeter.active = false;
}

// Animate a smooth "active listening" level without touching getUserMedia.
// The caller bumps `levelRef` based on recognition events; we just provide a
// living rAF loop that ensures the waveform stays animated while listening.
function startMicMeter(
  generation: number,
  generationRef: { current: number },
  levelRef: { current: number },
  onLevel: (value: number) => void,
) {
  stopMicMeter();
  micMeter.active = true;

  let lastEmit = 0;
  const tick = () => {
    if (generation !== generationRef.current || !micMeter.active) {
      levelRef.current = 0;
      return;
    }
    const now = performance.now();
    // Slowly decay the level so silence returns waveform to calm state.
    levelRef.current = Math.max(0, levelRef.current - 0.018);
    if (now - lastEmit > 80) {
      lastEmit = now;
      onLevel(levelRef.current);
    }
    micMeter.raf = requestAnimationFrame(tick);
  };
  micMeter.raf = requestAnimationFrame(tick);
}

function primeVoicePlayer() {
  const player = ensureVoicePlayer();
  if (!player) return;
  try {
    player.muted = false;
    player.defaultMuted = false;
    player.volume = currentOutputVolume;
    if (player.src !== SILENT_WAV) player.src = SILENT_WAV;
    player.currentTime = 0;
    const play = player.play();
    if (play && typeof play.catch === "function") {
      void play.catch(() => {
        /* autoplay may still be blocked until a later gesture */
      });
    }
  } catch {
    /* keep going; speechSynthesis may still work */
  }
}

function resumeAudioGraph() {
  // Do not create/resume AudioContext here — Chrome ducks speechSynthesis
  // when an unrelated AudioContext starts while TTS is playing.
  applyOutputVolume(currentOutputVolume);
}

function startResumeWatch() {
  if (typeof window === "undefined" || resumeWatchId != null) return;
  resumeWatchId = window.setInterval(() => {
    try {
      if (!("speechSynthesis" in window)) return;
      if (window.speechSynthesis.speaking) {
        window.speechSynthesis.resume();
      }
    } catch {
      /* ignore */
    }
  }, 220);
}

function stopResumeWatch() {
  if (resumeWatchId == null) return;
  window.clearInterval(resumeWatchId);
  resumeWatchId = null;
}

export function cancelSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    stopResumeWatch();
    window.speechSynthesis.cancel();
    resumeSpeechSynthesis();
  } catch {
    /* ignore */
  }
}

export function unlockSpeechSynthesis() {
  if (typeof window === "undefined") return;
  ensureVoicePlayer();
  resumeAudioGraph();
  resumeSpeechSynthesis();
  if (speechUnlocked) return;
  primeVoicePlayer();
  unlockAudioContext();
  try {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    const warm = new SpeechSynthesisUtterance("");
    warm.volume = 1;
    warm.rate = 1;
    warm.pitch = 1;
    warm.lang = "en-US";
    window.speechSynthesis.speak(warm);
    speechUnlocked = true;
    window.speechSynthesis.resume();
  } catch {
    speechUnlocked = true;
    resumeSpeechSynthesis();
  }
}

function kickUtterance(
  utterance: SpeechSynthesisUtterance,
  generation: number,
  generationRef: { current: number },
  interrupt = false,
) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (generation !== generationRef.current) return;
  try {
    utterance.lang = "en-US";
    utterance.volume = Math.max(0, Math.min(1, currentOutputVolume));
    activeUtterance = utterance;
    if (interrupt && (window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
      window.speechSynthesis.cancel();
    }
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
    window.speechSynthesis.resume();
    startResumeWatch();
  } catch {
    resumeSpeechSynthesis();
  }
}

const ANDROID_MALE_NAME_RE = /male_1|\bmale\b|david|george|james|aaron|guy|\biol\b/i;

const MALE_VOICE_NEEDLES = [
  "google us english male",
  "google uk english male",
  "en-us-guyneural",
  "guy neural",
  "microsoft guy",
  "microsoft david",
  "en-us-standard-b",
  "en-us-neural2-d",
  "en-us-wavenet-d",
  "uk english male",
  "us english male",
  "male_1",
  "en-us-x-tpd",
  "iol",
  "arthur",
  "daniel",
  "david",
  "george",
  "aaron",
  "male",
  "alex",
  "guy",
  "james",
  "fred",
  "matthew",
  "brian",
  "mark",
  "ryan",
];

const FEMALE_VOICE_NEEDLES = [
  "google us english female",
  "google uk english female",
  "en-us-jennyneural",
  "jenny neural",
  "microsoft jenny",
  "microsoft zira",
  "en-us-neural2-f",
  "en-us-wavenet-f",
  "samantha",
  "victoria",
  "karen",
  "moira",
  "zira",
  "jenny",
  "aria",
  "moira",
  "female",
];

function rankVoicesByNeedles(voices: SpeechSynthesisVoice[], needles: string[], gender: "male" | "female") {
  return listEnglishVoices(voices)
    .map((voice) => {
      const blob = `${voice.name} ${voice.voiceURI}`.toLowerCase();
      if (gender === "male" && isVoiceLikelyFemale(voice) && !blob.includes("male")) {
        return { voice, score: -1 };
      }
      if (gender === "female" && isVoiceLikelyMale(voice) && !blob.includes("female")) {
        return { voice, score: -1 };
      }
      let score = 0;
      needles.forEach((needle, index) => {
        if (blob.includes(needle)) score += 56 - index * 2;
      });
      if (gender === "male" && isVoiceLikelyMale(voice)) score += 14;
      if (gender === "female" && isVoiceLikelyFemale(voice)) score += 14;
      return { voice, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
}

function englishVoicePool(voices: SpeechSynthesisVoice[]) {
  const english = voices.filter((voice) => (voice.lang || "").toLowerCase().replace(/_/g, "-").startsWith("en"));
  return english.length > 0 ? english : listEnglishVoices(voices);
}

function pickPreferredVoice(voices: SpeechSynthesisVoice[], character?: Character | null, preferredUri?: string | null) {
  const gender = character?.voice.gender ?? "female";
  const english = englishVoicePool(voices);
  const preferred = findVoiceByUri(voices, preferredUri);
  if (preferred && voiceFitsRequiredGender(preferred, gender)) return preferred;

  if (gender === "male") {
    const priority = english.filter((voice) => voiceFitsRequiredGender(voice, "male") && ANDROID_MALE_NAME_RE.test(`${voice.name} ${voice.voiceURI}`));
    if (priority[0]) return priority[0];
    const ranked = rankVoicesByNeedles(english.filter((voice) => voiceFitsRequiredGender(voice, "male")), MALE_VOICE_NEEDLES, "male");
    if (ranked[0] && voiceFitsRequiredGender(ranked[0].voice, "male")) return ranked[0].voice;
    const strict = english.find((voice) => voiceFitsRequiredGender(voice, "male"));
    if (strict) return strict;
    const picked = pickCharacterVoice(voices, character);
    return picked && voiceFitsRequiredGender(picked, "male") ? picked : null;
  }

  const ranked = rankVoicesByNeedles(english.filter((voice) => voiceFitsRequiredGender(voice, "female")), FEMALE_VOICE_NEEDLES, "female");
  if (ranked[0] && voiceFitsRequiredGender(ranked[0].voice, "female")) return ranked[0].voice;
  const strict = english.find((voice) => voiceFitsRequiredGender(voice, "female"));
  if (strict) return strict;
  const picked = pickCharacterVoice(voices, character);
  return picked && voiceFitsRequiredGender(picked, "female") ? picked : null;
}

function pickStreamingVoice(
  voices: SpeechSynthesisVoice[],
  character?: Character | null,
  preferredUri?: string | null,
) {
  return pickPreferredVoice(voices, character, preferredUri);
}

function smoothSpokenText(text: string) {
  return text
    // Chrome TTS often errors / drops the rest of the queue on emoji & ZWJ sequences.
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\uFE0F\u200D\u20E3]/g, "")
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.!?])/g, "$1")
    .trim();
}

export function useSpeech(options?: {
  character?: Character | null;
  rateMultiplier?: number;
  preferredVoiceUri?: string | null;
  onFinalTranscript?: (text: string) => void;
  onListenError?: (reason: "not-allowed" | "unavailable") => void;
  onUtteranceStart?: (text: string) => void;
  onUtteranceEnqueue?: (text: string) => void;
  onSpeakEnd?: () => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [audioLevel, setAudioLevel] = useState(0);
  const [speakingText, setSpeakingText] = useState("");
  const [speechLang, setSpeechLang] = useState<SpeechLang>("en-US");
  const [speechSupported, setSpeechSupported] = useState({ tts: false, stt: false });
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  const recognizerRef = useRef<RecognitionInstance | null>(null);
  const activeLangRef = useRef<SpeechLang>("en-US");
  const streamsRef = useRef(emptyStreams());
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const characterRef = useRef<Character | null>(options?.character ?? null);
  const rateMultiplierRef = useRef(options?.rateMultiplier ?? 1);
  const preferredVoiceUriRef = useRef(options?.preferredVoiceUri ?? "");
  const onFinalTranscriptRef = useRef(options?.onFinalTranscript);
  const onListenErrorRef = useRef(options?.onListenError);
  const onUtteranceStartRef = useRef(options?.onUtteranceStart);
  const onUtteranceEnqueueRef = useRef(options?.onUtteranceEnqueue);
  const onSpeakEndRef = useRef(options?.onSpeakEnd);
  const shouldListenRef = useRef(false);
  const startingRef = useRef(false);
  const submittedRef = useRef(false);
  const listenGenerationRef = useRef(0);
  const latestTranscriptRef = useRef("");
  const committedTranscriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const idleListenTimerRef = useRef<number | null>(null);
  const heardSpeechRef = useRef(false);
  const speechQueueRef = useRef<string[]>([]);
  const ttsBusyRef = useRef(false);
  const ttsGenerationRef = useRef(0);
  const sendTranscriptRef = useRef<(text?: string) => void>(() => {});
  const audioLevelRef = useRef(0);
  const volumeRef = useRef(1);
  const lastSpokenVolumeRef = useRef(1);
  const volumeRestartTimerRef = useRef<number | null>(null);
  const speakingTextRef = useRef("");
  const spokeThisTurnRef = useRef(false);

  characterRef.current = options?.character ?? null;
  rateMultiplierRef.current = options?.rateMultiplier ?? 1;
  preferredVoiceUriRef.current = options?.preferredVoiceUri ?? "";
  onFinalTranscriptRef.current = options?.onFinalTranscript;
  onListenErrorRef.current = options?.onListenError;
  onUtteranceStartRef.current = options?.onUtteranceStart;
  onUtteranceEnqueueRef.current = options?.onUtteranceEnqueue;
  onSpeakEndRef.current = options?.onSpeakEnd;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current != null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const clearIdleListenTimer = useCallback(() => {
    if (idleListenTimerRef.current != null) {
      window.clearTimeout(idleListenTimerRef.current);
      idleListenTimerRef.current = null;
    }
  }, []);

  const snapshotSpokenText = useCallback(() => {
    return (
      latestTranscriptRef.current ||
      committedTranscriptRef.current ||
      pickBestTranscript(streamsRef.current)
    ).trim();
  }, []);

  const resetListeningState = useCallback(() => {
    shouldListenRef.current = false;
    startingRef.current = false;
    clearSilenceTimer();
    clearIdleListenTimer();
    heardSpeechRef.current = false;
    streamsRef.current["en-US"].running = false;
    streamsRef.current["he-IL"].running = false;
    stopMicMeter();
    audioLevelRef.current = 0;
    setAudioLevel(0);
    setIsListening(false);
  }, [clearIdleListenTimer, clearSilenceTimer]);

  const stopRecognizer = useCallback(() => {
    const recognition = recognizerRef.current;
    const lang = activeLangRef.current;
    streamsRef.current[lang].running = false;
    if (!recognition) return;

    // Keep onend attached so mobile WebKit can still submit leftover speech.
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    }

    recognizerRef.current = null;
  }, []);

  const sendTranscript = useCallback(
    (rawText?: string) => {
      if (submittedRef.current) {
        stopRecognizer();
        resetListeningState();
        return;
      }

      const text = (rawText ?? snapshotSpokenText()).trim();
      if (!text) {
        submittedRef.current = true;
        stopRecognizer();
        resetListeningState();
        return;
      }

      submittedRef.current = true;
      shouldListenRef.current = false;
      clearSilenceTimer();
      setIsListening(false);
      onFinalTranscriptRef.current?.(text);
      latestTranscriptRef.current = "";
      committedTranscriptRef.current = "";
      stopRecognizer();
      resetListeningState();
    },
    [clearSilenceTimer, resetListeningState, snapshotSpokenText, stopRecognizer],
  );

  sendTranscriptRef.current = sendTranscript;

  const armSilenceSubmit = useCallback(
    (delayMs: number) => {
      clearSilenceTimer();
      const session = listenGenerationRef.current;
      silenceTimerRef.current = window.setTimeout(() => {
        if (session !== listenGenerationRef.current || submittedRef.current) return;
        const text = snapshotSpokenText();
        if (!text) return;
        sendTranscriptRef.current(text);
      }, delayMs);
    },
    [clearSilenceTimer, snapshotSpokenText],
  );

  const startRecognizer = useCallback(
    (_lang?: SpeechLang) => {
      const Recognition = getRecognitionConstructor();
      if (!Recognition || !shouldListenRef.current) return false;

      try {
        const recognition = new Recognition();
        const session = listenGenerationRef.current;
        const mobile = isMobileDevice();
        recognition.continuous = !mobile;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = "en-US";
        activeLangRef.current = "en-US";
        const activeLang: SpeechLang = "en-US";

        recognition.onstart = () => {
          if (session !== listenGenerationRef.current) return;
          try {
            streamsRef.current[activeLang].running = true;
            setIsListening(true);
            startMicMeter(session, listenGenerationRef, audioLevelRef, setAudioLevel);
          } catch {
            sendTranscriptRef.current("");
          }
        };

        recognition.onresult = (event) => {
          if (session !== listenGenerationRef.current || submittedRef.current) return;
          try {
            const { interim, final, confidence, isFinal } = readResultChunk(event);
            if (final) {
              committedTranscriptRef.current = `${committedTranscriptRef.current} ${final}`.trim();
            }
            const currentText = `${committedTranscriptRef.current} ${interim}`.trim() || (final || interim).trim();
            if (currentText) {
              heardSpeechRef.current = true;
              clearIdleListenTimer();
              // Bump the level indicator so the waveform reacts to voice activity.
              // We decay it slowly; the rAF loop in startMicMeter emits it.
              audioLevelRef.current = Math.min(1, audioLevelRef.current + 0.45);
              latestTranscriptRef.current = currentText;
              streamsRef.current[activeLang] = {
                text: currentText,
                confidence,
                running: true,
              };
              setTranscript(currentText);
              setSpeechLang("en-US");
              armSilenceSubmit(isFinal ? FINAL_SUBMIT_MS : SILENCE_SUBMIT_MS);
            } else {
              // No speech yet — gently pulse the meter so the waveform looks alive.
              audioLevelRef.current = Math.max(0, audioLevelRef.current - 0.08);
            }
          } catch {
            /* keep listening; a bad result must not freeze the mic */
          }
        };

        recognition.onnomatch = () => {
          /* Wait for onend so any interim text can still submit. */
        };

        recognition.onerror = (event) => {
          if (session !== listenGenerationRef.current) return;
          const error = String(event.error || "");
          if (error === "not-allowed" || error === "service-not-allowed" || error === "audio-capture") {
            onListenErrorRef.current?.("not-allowed");
            sendTranscriptRef.current("");
            return;
          }
          if (error === "aborted" || error === "no-speech") {
            /* onend is the submission fallback; do not drop spoken text here. */
            return;
          }
        };

        recognition.onend = () => {
          if (session !== listenGenerationRef.current) return;
          const immediate = snapshotSpokenText();
          window.setTimeout(() => {
            if (session !== listenGenerationRef.current) return;
            if (submittedRef.current) {
              resetListeningState();
              return;
            }
            const textToSend = snapshotSpokenText() || immediate;
            sendTranscriptRef.current(textToSend);
          }, ONEND_RESULT_GRACE_MS);
        };

        recognizerRef.current = recognition;
        try {
          recognition.start();
        } catch {
          recognizerRef.current = null;
          streamsRef.current[activeLang].running = false;
          return false;
        }
        return true;
      } catch {
        recognizerRef.current = null;
        streamsRef.current["en-US"].running = false;
        streamsRef.current["he-IL"].running = false;
        return false;
      }
    },
    [armSilenceSubmit, clearIdleListenTimer, resetListeningState, snapshotSpokenText],
  );

  useEffect(() => {
    const tts = typeof window !== "undefined" && "speechSynthesis" in window;
    const stt = Boolean(getRecognitionConstructor());
    setSpeechSupported({ tts, stt });
    setSpeechLang("en-US");

    if (!tts) {
      return () => {
        shouldListenRef.current = false;
        stopRecognizer();
        resetListeningState();
      };
    }

    const loadVoices = () => {
      const next = collectVoices();
      voicesRef.current = next;
      setVoices(next);
    };

    loadVoices();
    void waitForVoices().then((next) => {
      voicesRef.current = next;
      setVoices(next);
    });
    try {
      if (typeof window.speechSynthesis.addEventListener === "function") {
        window.speechSynthesis.addEventListener("voiceschanged", loadVoices);
      } else {
        window.speechSynthesis.onvoiceschanged = loadVoices;
      }
    } catch {
      /* some WebViews expose TTS without event support */
    }

    const unlockOnGesture = () => unlockSpeechSynthesis();
    window.addEventListener("pointerdown", unlockOnGesture, { capture: true, passive: true });
    window.addEventListener("touchstart", unlockOnGesture, { capture: true, passive: true });
    window.addEventListener("click", unlockOnGesture, { capture: true, passive: true });

    return () => {
      window.removeEventListener("pointerdown", unlockOnGesture, true);
      window.removeEventListener("touchstart", unlockOnGesture, true);
      window.removeEventListener("click", unlockOnGesture, true);
      try {
        if (typeof window.speechSynthesis.removeEventListener === "function") {
          window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
        } else {
          window.speechSynthesis.onvoiceschanged = null;
        }
        window.speechSynthesis.cancel();
        stopResumeWatch();
      } catch {
        /* ignore */
      }
      shouldListenRef.current = false;
      stopRecognizer();
      resetListeningState();
    };
    // Voice setup must not re-bind on callback identity changes or it kills the mic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const waitingForVoicesRef = useRef(false);
  const voicesWaitedRef = useRef(false);

  const playNextUtterance = useCallback((preview?: { rateMultiplier?: number; voiceUri?: string | null }) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (ttsBusyRef.current) return;
    if (volumeRef.current <= 0.001) {
      setIsSpeaking(false);
      return;
    }

    const next = speechQueueRef.current[0];
    if (!next) {
      stopResumeWatch();
      setIsSpeaking(false);
      setSpeakingText("");
      if (spokeThisTurnRef.current) {
        spokeThisTurnRef.current = false;
        onSpeakEndRef.current?.();
      }
      return;
    }

    setSpeakingText(next);

    const voices = collectVoices();
    voicesRef.current = voices;
    if (voices.length === 0 && !voicesWaitedRef.current) {
      if (waitingForVoicesRef.current) return;
      waitingForVoicesRef.current = true;
      void waitForVoices().then((loaded) => {
        waitingForVoicesRef.current = false;
        voicesWaitedRef.current = true;
        voicesRef.current = loaded;
        setVoices(loaded);
        playNextUtterance(preview);
      });
      return;
    }

    speechQueueRef.current.shift();

    try {
      shouldListenRef.current = false;
      submittedRef.current = true;
      stopRecognizer();
      resetListeningState();
      resumeSpeechSynthesis();
      const character = characterRef.current;
      const voice = pickStreamingVoice(voices, character, preview?.voiceUri ?? preferredVoiceUriRef.current);
      const speed = preview?.rateMultiplier ?? rateMultiplierRef.current ?? 1;
      const utterance = new SpeechSynthesisUtterance(smoothSpokenText(next));
      const generation = ttsGenerationRef.current;
      let started = false;
      const male = character?.voice.gender === "male";
      const volume = Math.max(0, Math.min(1, volumeRef.current));
      utterance.lang = "en-US";
      utterance.volume = volume;
      activeUtterance = utterance;
      currentOutputVolume = volume;
      lastSpokenVolumeRef.current = volume;
      utterance.rate = Math.min(1.4, Math.max(0.6, (character?.voice.rate ?? (male ? 0.92 : 0.95)) * speed));
      const maleNamed = Boolean(voice && ANDROID_MALE_NAME_RE.test(`${voice.name} ${voice.voiceURI}`));
      utterance.pitch = character?.voice.pitch ?? (male ? (maleNamed ? 0.78 : 0.85) : 1.02);
      window.speechSynthesis.resume();
      if (voice && voiceFitsRequiredGender(voice, male ? "male" : "female")) {
        utterance.voice = voice;
      } else {
        utterance.pitch = male ? 0.72 : 1.14;
      }

      ttsBusyRef.current = true;
      setIsSpeaking(true);
      setSpeakingText(next);
      speakingTextRef.current = next;
      onUtteranceEnqueueRef.current?.(next);
      utterance.onstart = () => {
        if (generation !== ttsGenerationRef.current) return;
        started = true;
        spokeThisTurnRef.current = true;
        setIsSpeaking(true);
        onUtteranceStartRef.current?.(next);
        resumeSpeechSynthesis();
        startResumeWatch();
      };
      // Chrome drops the next speak() if called synchronously inside onend/onerror.
      const advanceQueue = () => {
        window.setTimeout(() => {
          if (generation !== ttsGenerationRef.current) return;
          playNextUtterance(preview);
        }, 40);
      };
      utterance.onend = () => {
        if (generation !== ttsGenerationRef.current) return;
        if (activeUtterance === utterance) activeUtterance = null;
        ttsBusyRef.current = false;
        advanceQueue();
      };
      utterance.onerror = () => {
        if (generation !== ttsGenerationRef.current) return;
        if (activeUtterance === utterance) activeUtterance = null;
        ttsBusyRef.current = false;
        advanceQueue();
      };

      kickUtterance(utterance, generation, ttsGenerationRef);

      window.setTimeout(() => {
        if (generation !== ttsGenerationRef.current || started) return;
        if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
          resumeSpeechSynthesis();
          return;
        }
        const retry = new SpeechSynthesisUtterance(next);
        retry.lang = "en-US";
        retry.rate = utterance.rate;
        retry.pitch = utterance.pitch;
        retry.volume = Math.max(0, Math.min(1, volumeRef.current));
        if (voice && voiceFitsRequiredGender(voice, male ? "male" : "female")) retry.voice = voice;
        else retry.pitch = male ? 0.72 : 1.14;
        retry.onstart = utterance.onstart;
        retry.onend = utterance.onend;
        retry.onerror = utterance.onerror;
        kickUtterance(retry, generation, ttsGenerationRef);
      }, 160);
    } catch {
      ttsBusyRef.current = false;
      setIsSpeaking(false);
      setSpeakingText("");
    }
  }, [resetListeningState, stopRecognizer]);

  const stopSpeaking = useCallback(() => {
    ttsGenerationRef.current += 1;
    spokeThisTurnRef.current = false;
    speechQueueRef.current = [];
    ttsBusyRef.current = false;
    activeUtterance = null;
    setSpeakingText("");
    speakingTextRef.current = "";
    cancelSpeechSynthesis();
    setIsSpeaking(false);
  }, []);

  const setVolume = useCallback((next: number, _options?: { commitMute?: boolean }) => {
    const v = Math.max(0, Math.min(1, next));
    volumeRef.current = v;
    applyOutputVolume(v);

    const clearVolumeRestart = () => {
      if (volumeRestartTimerRef.current != null) {
        window.clearTimeout(volumeRestartTimerRef.current);
        volumeRestartTimerRef.current = null;
      }
    };

    const parkCurrentChunk = () => {
      const current = speakingTextRef.current.trim();
      if (!current) return;
      if (speechQueueRef.current[0] !== current) {
        speechQueueRef.current = [current, ...speechQueueRef.current];
      }
    };

    if (v <= 0.001) {
      clearVolumeRestart();
      parkCurrentChunk();
      ttsGenerationRef.current += 1;
      ttsBusyRef.current = false;
      activeUtterance = null;
      cancelSpeechSynthesis();
      setIsSpeaking(false);
      return;
    }

    const speakingNow =
      ttsBusyRef.current ||
      (typeof window !== "undefined" && Boolean(window.speechSynthesis?.speaking));

    if (speakingNow) {
      if (Math.abs(v - lastSpokenVolumeRef.current) < 0.04) return;
      clearVolumeRestart();
      // speechSynthesis locks volume at speak() — replay only the current chunk
      // so loudness changes immediately without dropping the rest of the queue.
      volumeRestartTimerRef.current = window.setTimeout(() => {
        volumeRestartTimerRef.current = null;
        if (volumeRef.current <= 0.001) return;
        const current = speakingTextRef.current.trim();
        if (!current) return;
        parkCurrentChunk();
        ttsGenerationRef.current += 1;
        cancelSpeechSynthesis();
        ttsBusyRef.current = false;
        activeUtterance = null;
        setIsSpeaking(true);
        playNextUtterance();
      }, 140);
      return;
    }

    if (speechQueueRef.current.length > 0) {
      playNextUtterance();
    }
  }, [playNextUtterance]);

  const speak = useCallback(
    (text: string, preview?: { rateMultiplier?: number; voiceUri?: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      stopSpeaking();
      resumeAudioGraph();
      speechQueueRef.current = [smoothSpokenText(trimmed)];
      playNextUtterance(preview);
    },
    [playNextUtterance, stopSpeaking],
  );

  const beginSpeakStream = useCallback(() => {
    speechQueueRef.current = [];
    resumeAudioGraph();
    resumeSpeechSynthesis();
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      ttsBusyRef.current = false;
      return;
    }
    const busy = ttsBusyRef.current || window.speechSynthesis.speaking || window.speechSynthesis.pending;
    if (busy) {
      ttsGenerationRef.current += 1;
      ttsBusyRef.current = false;
      cancelSpeechSynthesis();
    }
    ttsBusyRef.current = false;
  }, []);

  const enqueueSpeak = useCallback(
    (text: string, preview?: { rateMultiplier?: number; voiceUri?: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      resumeAudioGraph();
      resumeSpeechSynthesis();
      const spoken = smoothSpokenText(trimmed);
      const last = speechQueueRef.current[speechQueueRef.current.length - 1];
      if (last && last.length < 90 && !/[.!?…]["']?$/.test(last)) {
        speechQueueRef.current[speechQueueRef.current.length - 1] = `${last} ${spoken}`;
      } else {
        speechQueueRef.current.push(spoken);
      }
      setIsSpeaking(true);
      playNextUtterance(preview);
    },
    [playNextUtterance],
  );

  const stopListening = useCallback(() => {
    sendTranscript();
  }, [sendTranscript]);

  const startListening = useCallback(
    (preferredLang?: SpeechLang) => {
      try {
        const Recognition = getRecognitionConstructor();
        if (!Recognition) {
          resetListeningState();
          onListenErrorRef.current?.("unavailable");
          return false;
        }
        if (startingRef.current || shouldListenRef.current) return isListening;

        // Cancel leftover TTS so iOS/WebKit can open the mic. Do not create
        // AudioContext or silent utterances here — they deadlock recognition.
        cancelSpeechSynthesis();
        startingRef.current = true;
        listenGenerationRef.current += 1;
        shouldListenRef.current = false;
        stopRecognizer();

        streamsRef.current = emptyStreams();
        latestTranscriptRef.current = "";
        committedTranscriptRef.current = "";
        setTranscript("");
        setSpeechLang("en-US");

        submittedRef.current = false;
        heardSpeechRef.current = false;
        shouldListenRef.current = true;
        setIsListening(true);

        const started = startRecognizer("en-US");
        startingRef.current = false;
        if (!started) {
          submittedRef.current = true;
          resetListeningState();
          return false;
        }
        const session = listenGenerationRef.current;
        clearIdleListenTimer();
        idleListenTimerRef.current = window.setTimeout(() => {
          if (session !== listenGenerationRef.current || submittedRef.current) return;
          if (heardSpeechRef.current || snapshotSpokenText()) return;
          submittedRef.current = true;
          stopRecognizer();
          resetListeningState();
        }, IDLE_LISTEN_CLOSE_MS);
        return true;
      } catch {
        submittedRef.current = true;
        stopRecognizer();
        resetListeningState();
        return false;
      }
    },
    [clearIdleListenTimer, isListening, resetListeningState, snapshotSpokenText, startRecognizer, stopRecognizer],
  );

  const toggleListening = useCallback(
    (preferredLang?: SpeechLang) => {
      if (isListening) {
        stopListening();
        return true;
      }
      return startListening(preferredLang);
    },
    [isListening, startListening, stopListening],
  );

  return {
    speak,
    enqueueSpeak,
    beginSpeakStream,
    unlockSpeech: unlockSpeechSynthesis,
    stopSpeaking,
    setVolume,
    startListening,
    stopListening,
    toggleListening,
    isListening,
    isSpeaking,
    transcript,
    audioLevel,
    audioLevelRef,
    speakingText,
    speechLang,
    speechSupported,
    voices: listEnglishVoices(voices),
  };
}
