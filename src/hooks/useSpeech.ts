"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  englishWordRatio,
  hasHebrewScript,
  inferBrowserSpeechLang,
  looksLikeGibberishEnglish,
  type SpeechLang,
} from "@/lib/language";
import { findVoiceByUri, listEnglishVoices, pickCharacterVoice, type Character } from "@/lib/characters";

export const SPEECH_UNAVAILABLE_MESSAGE =
  "Speech recognition is not fully supported or microphone access was denied";

export const MIC_PERMISSION_MESSAGE = "Please allow microphone access in your browser settings";

const SILENCE_IDLE_MS = 4000;
const FINAL_SUBMIT_MS = 700;

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

function readResult(event: {
  resultIndex: number;
  results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string; confidence: number } } };
}) {
  let text = "";
  let confidence = 0;
  let isFinal = false;

  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i];
    text += result[0].transcript;
    confidence = result[0].confidence || confidence;
    if (result.isFinal) isFinal = true;
  }

  return { text: text.trim(), confidence, isFinal };
}

let unlockContext: AudioContext | null = null;

function resumeSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.resume();
  } catch {
    /* Chrome can pause the synth after async work */
  }
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

export function cancelSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    resumeSpeechSynthesis();
  } catch {
    /* ignore */
  }
}

export function unlockSpeechSynthesis() {
  if (typeof window === "undefined") return;
  try {
    if (!("speechSynthesis" in window)) return;
    resumeSpeechSynthesis();
    const warm = new SpeechSynthesisUtterance("");
    warm.volume = 0;
    warm.rate = 1;
    warm.pitch = 1;
    window.speechSynthesis.speak(warm);
    resumeSpeechSynthesis();
  } catch {
    resumeSpeechSynthesis();
  }
}

function unlockPlaybackAudio() {
  if (isMobileDevice()) return;
  unlockAudioContext();
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
  const silenceTimerRef = useRef<number | null>(null);
  const speechQueueRef = useRef<string[]>([]);
  const ttsBusyRef = useRef(false);
  const ttsGenerationRef = useRef(0);
  const submitListeningRef = useRef<(forceIdle?: boolean) => void>(() => {});

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

  const currentSpokenText = useCallback(() => {
    return (latestTranscriptRef.current || pickBestTranscript(streamsRef.current)).trim();
  }, []);

  const publishLiveTranscript = useCallback((raw: string) => {
    const best = pickBestTranscript(streamsRef.current) || raw.trim();
    if (!best) return;
    latestTranscriptRef.current = best;
    setTranscript(best);
    setSpeechLang(hasHebrewScript(best) ? "he-IL" : "en-US");
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

  const submitListening = useCallback(
    (forceIdle = false) => {
      if (submittedRef.current) {
        stopRecognizer();
        resetListeningState();
        return;
      }
      submittedRef.current = true;
      listenGenerationRef.current += 1;
      const text = currentSpokenText();
      shouldListenRef.current = false;
      stopRecognizer();
      resetListeningState();
      if (!forceIdle && text) {
        onFinalTranscriptRef.current?.(text);
      }
    },
    [currentSpokenText, resetListeningState, stopRecognizer],
  );

  submitListeningRef.current = submitListening;

  const armSilence = useCallback(
    (delayMs: number) => {
      clearSilenceTimer();
      const session = listenGenerationRef.current;
      silenceTimerRef.current = window.setTimeout(() => {
        if (session !== listenGenerationRef.current) return;
        const text = currentSpokenText();
        submitListeningRef.current(!text);
      }, delayMs);
    },
    [clearSilenceTimer, currentSpokenText],
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
            armSilence(SILENCE_IDLE_MS);
          } catch {
            submitListeningRef.current(true);
          }
        };

        recognition.onresult = (event) => {
          if (session !== listenGenerationRef.current || submittedRef.current) return;
          try {
            const result = readResult(event);
            streamsRef.current[activeLang] = {
              text: result.text,
              confidence: result.confidence,
              running: true,
            };
            if (result.text) {
              latestTranscriptRef.current = result.text;
            }
            publishLiveTranscript(result.text);
            armSilence(result.isFinal ? FINAL_SUBMIT_MS : SILENCE_IDLE_MS);
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
            submitListeningRef.current(true);
            return;
          }
          if (error === "aborted" || error === "no-speech") {
            /* onend is the submission fallback; do not drop spoken text here. */
            return;
          }
        };

        recognition.onend = () => {
          if (session !== listenGenerationRef.current) return;
          if (submittedRef.current) {
            resetListeningState();
            return;
          }
          const text = currentSpokenText();
          if (text) {
            submitListeningRef.current(false);
            return;
          }
          submitListeningRef.current(true);
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
    [armSilence, currentSpokenText, publishLiveTranscript, resetListeningState],
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

    return () => {
      try {
        if (typeof window.speechSynthesis.removeEventListener === "function") {
          window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
        } else {
          window.speechSynthesis.onvoiceschanged = null;
        }
        window.speechSynthesis.cancel();
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
      setIsSpeaking(false);
      return;
    }

    try {
      unlockPlaybackAudio();
      unlockSpeechSynthesis();
      resumeSpeechSynthesis();
      const character = characterRef.current;
      const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const preferred = findVoiceByUri(voices, preview?.voiceUri ?? preferredVoiceUriRef.current);
      const voice = preferred ?? pickCharacterVoice(voices, character);
      const speed = preview?.rateMultiplier ?? rateMultiplierRef.current ?? 1;
      const baseRate = character?.voice.rate ?? 0.95;
      const utterance = new SpeechSynthesisUtterance(next);
      const generation = ttsGenerationRef.current;
      utterance.lang = voice?.lang || "en-US";
      utterance.rate = Math.min(1.4, Math.max(0.6, baseRate * speed));
      utterance.pitch = character?.voice.pitch ?? 1;
      if (voice) utterance.voice = voice;

      ttsBusyRef.current = true;
      setIsSpeaking(true);
      utterance.onstart = () => {
        if (generation !== ttsGenerationRef.current) return;
        setIsSpeaking(true);
        resumeSpeechSynthesis();
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

      const kick = () => {
        try {
          if (generation !== ttsGenerationRef.current) return;
          resumeSpeechSynthesis();
          window.speechSynthesis.speak(utterance);
          resumeSpeechSynthesis();
        } catch {
          ttsBusyRef.current = false;
          setIsSpeaking(false);
        }
      };

      if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
        queueMicrotask(kick);
      } else {
        kick();
      }
    } catch {
      ttsBusyRef.current = false;
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    ttsGenerationRef.current += 1;
    speechQueueRef.current = [];
    ttsBusyRef.current = false;
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      resumeSpeechSynthesis();
    } catch {
      /* ignore */
    }
    setIsSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string, preview?: { rateMultiplier?: number; voiceUri?: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      stopSpeaking();
      speechQueueRef.current = [trimmed];
      playNextUtterance(preview);
    },
    [playNextUtterance, stopSpeaking],
  );

  const beginSpeakStream = useCallback(() => {
    speechQueueRef.current = [];
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      ttsBusyRef.current = false;
      return;
    }
    const busy = ttsBusyRef.current || window.speechSynthesis.speaking || window.speechSynthesis.pending;
    if (busy) {
      ttsGenerationRef.current += 1;
      ttsBusyRef.current = false;
      try {
        window.speechSynthesis.cancel();
        resumeSpeechSynthesis();
      } catch {
        /* ignore */
      }
    }
    ttsBusyRef.current = false;
  }, []);

  const enqueueSpeak = useCallback(
    (text: string, preview?: { rateMultiplier?: number; voiceUri?: string | null }) => {
      const trimmed = text.trim();
      if (!trimmed || typeof window === "undefined" || !("speechSynthesis" in window)) return;
      unlockSpeechSynthesis();
      resumeSpeechSynthesis();
      speechQueueRef.current.push(trimmed);
      setIsSpeaking(true);
      playNextUtterance(preview);
    },
    [playNextUtterance],
  );

  const stopListening = useCallback(() => {
    submitListening(false);
  }, [submitListening]);

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
        setTranscript("");
        setSpeechLang(resolveRecognitionLang(preferredLang).startsWith("he") ? "he-IL" : "en-US");

        submittedRef.current = false;
        shouldListenRef.current = true;
        setIsListening(true);
        armSilence(SILENCE_IDLE_MS);

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
    [armSilence, isListening, resetListeningState, startRecognizer, stopRecognizer],
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
