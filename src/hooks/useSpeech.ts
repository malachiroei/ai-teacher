"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  englishWordRatio,
  hasHebrewScript,
  inferBrowserSpeechLang,
  looksLikeGibberishEnglish,
  type SpeechLang,
} from "@/lib/language";
import { findVoiceByUri, isVoiceLikelyFemale, isVoiceLikelyMale, listEnglishVoices, pickCharacterVoice, type Character } from "@/lib/characters";

export const SPEECH_UNAVAILABLE_MESSAGE =
  "Speech recognition is not fully supported or microphone access was denied";

export const MIC_PERMISSION_MESSAGE = "Please allow microphone access in your browser settings";

const SILENCE_SUBMIT_MS = 4000;
const FINAL_SUBMIT_MS = 700;
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

function resolveRecognitionLang(preferred?: SpeechLang) {
  const fallback = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";
  if (isAppleTouchDevice()) return "en-US";
  return preferred || fallback || "en-US";
}

function emptyStreams(): Record<SpeechLang, LangStream> {
  return {
    "en-US": { text: "", confidence: 0, running: false },
    "he-IL": { text: "", confidence: 0, running: false },
  };
}

function scoreStream(lang: SpeechLang, stream: LangStream) {
  const text = stream.text.trim();
  if (!text) return -1;

  const confidence = Number.isFinite(stream.confidence) && stream.confidence > 0 ? stream.confidence : 0.45;
  const hebrewCount = (text.match(/[\u0590-\u05FF]/g) ?? []).length;

  if (lang === "he-IL") {
    if (hebrewCount > 0) return 3 + confidence + hebrewCount * 0.04;
    if (!looksLikeGibberishEnglish(text)) return confidence + 0.15;
    return confidence * 0.2;
  }

  if (hebrewCount > 0) return 3 + confidence;
  if (looksLikeGibberishEnglish(text)) return confidence * 0.12;
  return confidence + 0.4 + englishWordRatio(text);
}

function pickBestTranscript(streams: Record<SpeechLang, LangStream>) {
  const englishScore = scoreStream("en-US", streams["en-US"]);
  const hebrewScore = scoreStream("he-IL", streams["he-IL"]);
  if (hebrewScore <= 0 && englishScore <= 0) return "";
  return hebrewScore > englishScore ? streams["he-IL"].text.trim() : streams["en-US"].text.trim();
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
let speechUnlocked = false;
let resumeWatchId: number | null = null;

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
  voicePlayer.volume = 1;
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

export function getSpeechAudioContext() {
  unlockAudioContext();
  return unlockContext;
}

function primeVoicePlayer() {
  const player = ensureVoicePlayer();
  if (!player) return;
  try {
    player.muted = false;
    player.defaultMuted = false;
    player.volume = 1;
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
  unlockAudioContext();
  const player = ensureVoicePlayer();
  if (!player) return;
  player.muted = false;
  player.defaultMuted = false;
  player.volume = 1;
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

function kickUtterance(utterance: SpeechSynthesisUtterance, generation: number, generationRef: { current: number }) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (generation !== generationRef.current) return;
  try {
    resumeAudioGraph();
    utterance.volume = 1;
    utterance.lang = "en-US";
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
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

function pickStreamingVoice(voices: SpeechSynthesisVoice[], character?: Character | null, preferredUri?: string | null) {
  const gender = character?.voice.gender ?? "female";
  const preferred = findVoiceByUri(voices, preferredUri);
  if (preferred) {
    const mismatch =
      gender === "male" ? isVoiceLikelyFemale(preferred) : isVoiceLikelyMale(preferred);
    if (!mismatch) return preferred;
  }

  if (gender === "male") {
    const maleNeedles = [
      "google uk english male",
      "google us english male",
      "uk english male",
      "us english male",
      "male",
      "david",
      "george",
      "daniel",
      "alex",
      "guy",
      "james",
      "fred",
    ];
    const ranked = listEnglishVoices(voices)
      .map((voice) => {
        const blob = `${voice.name} ${voice.voiceURI}`.toLowerCase();
        if (isVoiceLikelyFemale(voice) && !blob.includes("male")) return { voice, score: -1 };
        let score = 0;
        maleNeedles.forEach((needle, index) => {
          if (blob.includes(needle)) score += 48 - index * 3;
        });
        if (isVoiceLikelyMale(voice)) score += 12;
        return { voice, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    if (ranked[0]) return ranked[0].voice;
  }

  const picked = pickCharacterVoice(voices, character);
  if (gender === "male" && picked && isVoiceLikelyFemale(picked)) return null;
  return picked;
}

export function useSpeech(options?: {
  character?: Character | null;
  rateMultiplier?: number;
  preferredVoiceUri?: string | null;
  onFinalTranscript?: (text: string) => void;
  onListenError?: (reason: "not-allowed" | "unavailable") => void;
}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
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
  const shouldListenRef = useRef(false);
  const startingRef = useRef(false);
  const submittedRef = useRef(false);
  const listenGenerationRef = useRef(0);
  const latestTranscriptRef = useRef("");
  const committedTranscriptRef = useRef("");
  const silenceTimerRef = useRef<number | null>(null);
  const speechQueueRef = useRef<string[]>([]);
  const ttsBusyRef = useRef(false);
  const ttsGenerationRef = useRef(0);
  const sendTranscriptRef = useRef<(text?: string) => void>(() => {});

  characterRef.current = options?.character ?? null;
  rateMultiplierRef.current = options?.rateMultiplier ?? 1;
  preferredVoiceUriRef.current = options?.preferredVoiceUri ?? "";
  onFinalTranscriptRef.current = options?.onFinalTranscript;
  onListenErrorRef.current = options?.onListenError;

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current != null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
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
    streamsRef.current["en-US"].running = false;
    streamsRef.current["he-IL"].running = false;
    setIsListening(false);
  }, [clearSilenceTimer]);

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
    (lang?: SpeechLang) => {
      const Recognition = getRecognitionConstructor();
      if (!Recognition || !shouldListenRef.current) return false;

      try {
        const recognition = new Recognition();
        const session = listenGenerationRef.current;
        const mobile = isMobileDevice();
        recognition.continuous = !mobile;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = resolveRecognitionLang(lang);
        activeLangRef.current = recognition.lang.startsWith("he") ? "he-IL" : "en-US";
        const activeLang = activeLangRef.current;

        recognition.onstart = () => {
          if (session !== listenGenerationRef.current) return;
          try {
            streamsRef.current[activeLang].running = true;
            setIsListening(true);
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
              latestTranscriptRef.current = currentText;
              streamsRef.current[activeLang] = {
                text: currentText,
                confidence,
                running: true,
              };
              setTranscript(currentText);
              setSpeechLang(hasHebrewScript(currentText) ? "he-IL" : "en-US");
              armSilenceSubmit(isFinal ? FINAL_SUBMIT_MS : SILENCE_SUBMIT_MS);
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
    [armSilenceSubmit, resetListeningState, snapshotSpokenText],
  );

  useEffect(() => {
    const tts = typeof window !== "undefined" && "speechSynthesis" in window;
    const stt = Boolean(getRecognitionConstructor());
    setSpeechSupported({ tts, stt });
    setSpeechLang(inferBrowserSpeechLang());

    if (!tts) {
      return () => {
        shouldListenRef.current = false;
        stopRecognizer();
        resetListeningState();
      };
    }

    const loadVoices = () => {
      try {
        const next = window.speechSynthesis.getVoices();
        voicesRef.current = next;
        setVoices(next);
      } catch {
        voicesRef.current = [];
        setVoices([]);
      }
    };

    loadVoices();
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

  const playNextUtterance = useCallback((preview?: { rateMultiplier?: number; voiceUri?: string | null }) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (ttsBusyRef.current) return;

    const next = speechQueueRef.current.shift();
    if (!next) {
      stopResumeWatch();
      setIsSpeaking(false);
      return;
    }

    try {
      resumeAudioGraph();
      resumeSpeechSynthesis();
      const character = characterRef.current;
      const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const voice = pickStreamingVoice(voices, character, preview?.voiceUri ?? preferredVoiceUriRef.current);
      const speed = preview?.rateMultiplier ?? rateMultiplierRef.current ?? 1;
      const utterance = new SpeechSynthesisUtterance(next);
      const generation = ttsGenerationRef.current;
      let started = false;
      const male = character?.voice.gender === "male";
      utterance.lang = "en-US";
      utterance.volume = 1;
      utterance.rate = Math.min(1.4, Math.max(0.6, (male ? 0.95 : character?.voice.rate ?? 0.95) * speed));
      utterance.pitch = male ? 0.82 : 1.05;
      window.speechSynthesis.resume();
      if (voice && !(male && isVoiceLikelyFemale(voice))) utterance.voice = voice;

      ttsBusyRef.current = true;
      setIsSpeaking(true);
      utterance.onstart = () => {
        if (generation !== ttsGenerationRef.current) return;
        started = true;
        setIsSpeaking(true);
        resumeSpeechSynthesis();
        startResumeWatch();
      };
      utterance.onend = () => {
        if (generation !== ttsGenerationRef.current) return;
        ttsBusyRef.current = false;
        playNextUtterance();
      };
      utterance.onerror = () => {
        if (generation !== ttsGenerationRef.current) return;
        ttsBusyRef.current = false;
        playNextUtterance();
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
        retry.volume = 1;
        if (voice) retry.voice = voice;
        retry.onstart = utterance.onstart;
        retry.onend = utterance.onend;
        retry.onerror = utterance.onerror;
        kickUtterance(retry, generation, ttsGenerationRef);
      }, 160);
    } catch {
      ttsBusyRef.current = false;
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    ttsGenerationRef.current += 1;
    speechQueueRef.current = [];
    ttsBusyRef.current = false;
    cancelSpeechSynthesis();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, preview?: { rateMultiplier?: number; voiceUri?: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      stopSpeaking();
      resumeAudioGraph();
      speechQueueRef.current = [trimmed];
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
      speechQueueRef.current.push(trimmed);
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
        setSpeechLang(resolveRecognitionLang(preferredLang).startsWith("he") ? "he-IL" : "en-US");

        submittedRef.current = false;
        shouldListenRef.current = true;
        setIsListening(true);

        const started = startRecognizer(preferredLang);
        startingRef.current = false;
        if (!started) {
          submittedRef.current = true;
          resetListeningState();
          return false;
        }
        return true;
      } catch {
        submittedRef.current = true;
        stopRecognizer();
        resetListeningState();
        return false;
      }
    },
    [isListening, resetListeningState, startRecognizer, stopRecognizer],
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
    startListening,
    stopListening,
    toggleListening,
    isListening,
    isSpeaking,
    transcript,
    speechLang,
    speechSupported,
    voices: listEnglishVoices(voices),
  };
}
