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

export function useSpeech(options?: {
  character?: Character | null;
  rateMultiplier?: number;
  preferredVoiceUri?: string | null;
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
  const shouldListenRef = useRef(false);
  const startingRef = useRef(false);
  const startWatchdogRef = useRef<number | null>(null);

  characterRef.current = options?.character ?? null;
  rateMultiplierRef.current = options?.rateMultiplier ?? 1;
  preferredVoiceUriRef.current = options?.preferredVoiceUri ?? "";

  const clearStartWatchdog = useCallback(() => {
    if (startWatchdogRef.current != null) {
      window.clearTimeout(startWatchdogRef.current);
      startWatchdogRef.current = null;
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
    streamsRef.current["en-US"].running = false;
    streamsRef.current["he-IL"].running = false;
    setIsListening(false);
  }, [clearStartWatchdog]);

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

  const startRecognizer = useCallback(
    (lang: SpeechLang) => {
      const Recognition = getRecognitionConstructor();
      if (!Recognition || !shouldListenRef.current) return false;

      try {
        const recognition = new Recognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        recognition.lang = isAppleTouchDevice() ? "en-US" : lang;
        activeLangRef.current = (recognition.lang as SpeechLang) || "en-US";
        const activeLang = activeLangRef.current;

        recognition.onstart = () => {
          try {
            clearStartWatchdog();
            streamsRef.current[activeLang].running = true;
            setIsListening(true);
          } catch {
            resetListeningState();
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
          } catch {
            /* keep listening; a bad result must not freeze the mic */
          }
        };

        recognition.onnomatch = () => {
          try {
            streamsRef.current[activeLang].running = false;
            publishTranscript();
          } catch {
            /* ignore */
          }
          resetListeningState();
        };

        recognition.onerror = (event) => {
          try {
            streamsRef.current[activeLang].running = false;
            const fatal =
              event.error === "not-allowed" ||
              event.error === "service-not-allowed" ||
              event.error === "audio-capture" ||
              event.error === "network";
            if (fatal || event.error === "aborted" || event.error === "no-speech") {
              shouldListenRef.current = false;
            }
            publishTranscript();
          } catch {
            shouldListenRef.current = false;
          }
          resetListeningState();
        };

        recognition.onend = () => {
          try {
            const stillCurrent = recognizerRef.current === recognition;
            streamsRef.current[activeLang].running = false;
            publishTranscript();
            if (!stillCurrent) return;
            recognizerRef.current = null;
          } catch {
            recognizerRef.current = null;
          }
          resetListeningState();
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
    [clearStartWatchdog, publishTranscript, resetListeningState],
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

  const speak = useCallback((text: string, preview?: { rateMultiplier?: number; voiceUri?: string | null }) => {
    if (!text.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    try {
      window.speechSynthesis.cancel();
      const character = characterRef.current;
      const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const preferred = findVoiceByUri(voices, preview?.voiceUri ?? preferredVoiceUriRef.current);
      const voice = preferred ?? pickCharacterVoice(voices, character);
      const speed = preview?.rateMultiplier ?? rateMultiplierRef.current ?? 1;
      const baseRate = character?.voice.rate ?? 0.95;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = voice?.lang || "en-US";
      utterance.rate = Math.min(1.4, Math.max(0.6, baseRate * speed));
      utterance.pitch = character?.voice.pitch ?? 1;
      if (voice) utterance.voice = voice;

      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);

      window.speechSynthesis.speak(utterance);
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    publishTranscript();
    stopRecognizer();
    resetListeningState();
  }, [publishTranscript, resetListeningState, stopRecognizer]);

  const startListening = useCallback(
    async (preferredLang?: SpeechLang) => {
      try {
        const Recognition = getRecognitionConstructor();
        if (!Recognition) {
          resetListeningState();
          return false;
        }
        if (startingRef.current || shouldListenRef.current) return isListening;

        startingRef.current = true;
        shouldListenRef.current = false;
        stopRecognizer();

        const preferred = preferredLang ?? inferBrowserSpeechLang();
        const lang: SpeechLang = isAppleTouchDevice() ? "en-US" : preferred;
        streamsRef.current = emptyStreams();
        setTranscript("");
        setSpeechLang(lang);

        const micOk = await ensureMicrophoneAccess();
        if (!micOk) {
          resetListeningState();
          return false;
        }

        await new Promise((resolve) => window.setTimeout(resolve, 80));

        shouldListenRef.current = true;
        setIsListening(true);

        const started = startRecognizer(lang);
        if (!started) {
          resetListeningState();
          return false;
        }

        clearStartWatchdog();
        startWatchdogRef.current = window.setTimeout(() => {
          if (!streamsRef.current[activeLangRef.current].running) {
            stopRecognizer();
            resetListeningState();
          }
        }, 5000);

        startingRef.current = false;
        return true;
      } catch {
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
