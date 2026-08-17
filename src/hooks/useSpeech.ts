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

async function ensureMicrophoneAccess() {
  if (typeof navigator === "undefined") return false;
  try {
    const permission = navigator.permissions;
    if (permission?.query) {
      try {
        const status = await permission.query({ name: "microphone" as PermissionName });
        if (status.state === "granted") return true;
        if (status.state === "denied") return false;
      } catch {
        /* Safari may reject microphone permission queries */
      }
    }
    if (!navigator.mediaDevices?.getUserMedia) return Boolean(getRecognitionConstructor());
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        /* already ended */
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    return true;
  } catch {
    return false;
  }
}

function resumeSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.resume();
  } catch {
    /* Chrome can pause the synth after async work */
  }
}

let speechUnlocked = false;

export function unlockSpeechSynthesis() {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    resumeSpeechSynthesis();
    if (speechUnlocked) return;
    const warm = new SpeechSynthesisUtterance(".");
    warm.volume = 0;
    warm.rate = 1;
    warm.pitch = 1;
    warm.onend = () => {
      speechUnlocked = true;
    };
    window.speechSynthesis.speak(warm);
    resumeSpeechSynthesis();
    speechUnlocked = true;
  } catch {
    resumeSpeechSynthesis();
  }
}

export function useSpeech(options?: {
  character?: Character | null;
  rateMultiplier?: number;
  preferredVoiceUri?: string | null;
  onFinalTranscript?: (text: string) => void;
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
  const shouldListenRef = useRef(false);
  const startingRef = useRef(false);
  const finalizedRef = useRef(true);
  const startWatchdogRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const speechQueueRef = useRef<string[]>([]);
  const ttsBusyRef = useRef(false);
  const ttsGenerationRef = useRef(0);

  characterRef.current = options?.character ?? null;
  rateMultiplierRef.current = options?.rateMultiplier ?? 1;
  preferredVoiceUriRef.current = options?.preferredVoiceUri ?? "";
  onFinalTranscriptRef.current = options?.onFinalTranscript;

  const clearStartWatchdog = useCallback(() => {
    if (startWatchdogRef.current != null) {
      window.clearTimeout(startWatchdogRef.current);
      startWatchdogRef.current = null;
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current != null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const publishTranscript = useCallback(() => {
    const next = pickBestTranscript(streamsRef.current);
    if (next) {
      setTranscript(next);
      setSpeechLang(hasHebrewScript(next) ? "he-IL" : "en-US");
    }
  }, []);

  const resetListeningState = useCallback(() => {
    shouldListenRef.current = false;
    startingRef.current = false;
    clearStartWatchdog();
    clearSilenceTimer();
    streamsRef.current["en-US"].running = false;
    streamsRef.current["he-IL"].running = false;
    setIsListening(false);
  }, [clearSilenceTimer, clearStartWatchdog]);

  const stopRecognizer = useCallback(() => {
    const recognition = recognizerRef.current;
    const lang = activeLangRef.current;
    streamsRef.current[lang].running = false;
    if (!recognition) return;

    try {
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onstart = null;
      recognition.onnomatch = null;
    } catch {
      /* Safari can throw if the instance is already gone */
    }

    try {
      if (isAppleTouchDevice()) {
        recognition.stop();
      } else {
        recognition.abort();
      }
    } catch {
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    }

    recognizerRef.current = null;
  }, []);

  const finalizeListeningRef = useRef<() => void>(() => {});

  const finalizeListening = useCallback(() => {
    if (finalizedRef.current) {
      stopRecognizer();
      resetListeningState();
      return;
    }
    finalizedRef.current = true;
    shouldListenRef.current = false;
    publishTranscript();
    const text = pickBestTranscript(streamsRef.current).trim();
    stopRecognizer();
    resetListeningState();
    if (text) onFinalTranscriptRef.current?.(text);
  }, [publishTranscript, resetListeningState, stopRecognizer]);

  finalizeListeningRef.current = finalizeListening;

  const startRecognizer = useCallback(
    (lang: SpeechLang) => {
      const Recognition = getRecognitionConstructor();
      if (!Recognition || !shouldListenRef.current) return false;

      try {
        const recognition = new Recognition();
        const apple = isAppleTouchDevice();
        recognition.continuous = !apple;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = apple ? "en-US" : lang;
        activeLangRef.current = (recognition.lang as SpeechLang) || "en-US";
        const activeLang = activeLangRef.current;

        const armSilence = (delayMs: number) => {
          if (apple) return;
          clearSilenceTimer();
          silenceTimerRef.current = window.setTimeout(() => {
            finalizeListeningRef.current();
          }, delayMs);
        };

        recognition.onstart = () => {
          try {
            clearStartWatchdog();
            streamsRef.current[activeLang].running = true;
            setIsListening(true);
          } catch {
            finalizeListeningRef.current();
          }
        };

        recognition.onresult = (event) => {
          try {
            const result = readResult(event);
            streamsRef.current[activeLang] = {
              text: result.text,
              confidence: result.confidence,
              running: true,
            };
            publishTranscript();
            armSilence(result.isFinal ? 120 : 600);
          } catch {
            /* keep listening; a bad result must not freeze the mic */
          }
        };

        recognition.onnomatch = () => {
          finalizeListeningRef.current();
        };

        recognition.onerror = () => {
          finalizeListeningRef.current();
        };

        recognition.onend = () => {
          if (recognizerRef.current !== recognition && recognizerRef.current) return;
          finalizeListeningRef.current();
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
        streamsRef.current[lang].running = false;
        return false;
      }
    },
    [clearSilenceTimer, clearStartWatchdog, publishTranscript],
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
    finalizeListening();
  }, [finalizeListening]);

  const startListening = useCallback(
    async (preferredLang?: SpeechLang) => {
      try {
        const Recognition = getRecognitionConstructor();
        if (!Recognition) {
          resetListeningState();
          return false;
        }
        if (startingRef.current || shouldListenRef.current) return isListening;

        resumeSpeechSynthesis();
        unlockSpeechSynthesis();
        startingRef.current = true;
        finalizedRef.current = true;
        shouldListenRef.current = false;
        stopRecognizer();

        const preferred = preferredLang ?? inferBrowserSpeechLang();
        const lang: SpeechLang = isAppleTouchDevice() ? "en-US" : preferred;
        streamsRef.current = emptyStreams();
        setTranscript("");
        setSpeechLang(lang);

        const micOk = await ensureMicrophoneAccess();
        if (!micOk) {
          startingRef.current = false;
          resetListeningState();
          return false;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 80));

        finalizedRef.current = false;
        shouldListenRef.current = true;
        setIsListening(true);

        const started = startRecognizer(lang);
        if (!started) {
          finalizedRef.current = true;
          resetListeningState();
          return false;
        }

        clearStartWatchdog();
        startWatchdogRef.current = window.setTimeout(() => {
          if (!streamsRef.current[activeLangRef.current].running) {
            finalizeListeningRef.current();
          }
        }, 5000);

        startingRef.current = false;
        return true;
      } catch {
        finalizedRef.current = true;
        stopRecognizer();
        resetListeningState();
        return false;
      }
    },
    [clearStartWatchdog, isListening, resetListeningState, startRecognizer, stopRecognizer],
  );

  const toggleListening = useCallback(
    async (preferredLang?: SpeechLang) => {
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
