"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  englishWordRatio,
  hasHebrewScript,
  inferBrowserSpeechLang,
  looksLikeGibberishEnglish,
  type SpeechLang,
} from "@/lib/language";

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

function pickEnglishVoice(voices: SpeechSynthesisVoice[]) {
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us") && voice.name.includes("Google")) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en-us")) ||
    voices.find((voice) => voice.lang.toLowerCase().startsWith("en")) ||
    null
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

function readResult(event: { resultIndex: number; results: { length: number; [index: number]: { isFinal: boolean; [index: number]: { transcript: string; confidence: number } } } }) {
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

export function useSpeech() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [speechLang, setSpeechLang] = useState<SpeechLang>("en-US");
  const [speechSupported, setSpeechSupported] = useState({ tts: false, stt: false });

  const recognizersRef = useRef<Partial<Record<SpeechLang, RecognitionInstance>>>({});
  const streamsRef = useRef(emptyStreams());
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const shouldListenRef = useRef(false);
  const preferredLangRef = useRef<SpeechLang>("en-US");
  const switchedForGibberishRef = useRef(false);
  const startRecognizerRef = useRef<(lang: SpeechLang) => boolean>(() => false);

  const publishTranscript = useCallback(() => {
    const next = pickBestTranscript(streamsRef.current);
    if (next) {
      setTranscript(next);
      setSpeechLang(hasHebrewScript(next) ? "he-IL" : "en-US");
    }
  }, []);

  const stopRecognizer = useCallback((lang: SpeechLang) => {
    const recognition = recognizersRef.current[lang];
    streamsRef.current[lang].running = false;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;
    try {
      recognition.abort();
    } catch {
      /* already stopped */
    }
    delete recognizersRef.current[lang];
  }, []);

  const stopAllRecognizers = useCallback(() => {
    (Object.keys(recognizersRef.current) as SpeechLang[]).forEach(stopRecognizer);
  }, [stopRecognizer]);

  const startRecognizer = useCallback(
    (lang: SpeechLang) => {
      const Recognition = getRecognitionConstructor();
      if (!Recognition || !shouldListenRef.current) return false;
      if (streamsRef.current[lang].running) return true;

      const recognition = new Recognition();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        streamsRef.current[lang].running = true;
        setIsListening(true);
      };

      recognition.onresult = (event) => {
        const result = readResult(event);
        streamsRef.current[lang] = {
          text: result.text,
          confidence: result.confidence,
          running: true,
        };
        publishTranscript();

        const english = streamsRef.current["en-US"];
        const hebrewRunning = streamsRef.current["he-IL"].running;
        if (
          lang === "en-US" &&
          !hebrewRunning &&
          !switchedForGibberishRef.current &&
          looksLikeGibberishEnglish(english.text)
        ) {
          switchedForGibberishRef.current = true;
          startRecognizerRef.current("he-IL");
        }
      };

      recognition.onerror = (event) => {
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          shouldListenRef.current = false;
          streamsRef.current[lang].running = false;
          setIsListening(false);
          return;
        }
        if (event.error === "aborted") {
          streamsRef.current[lang].running = false;
        }
      };

      recognition.onend = () => {
        const stillCurrent = recognizersRef.current[lang] === recognition;
        streamsRef.current[lang].running = false;
        if (!shouldListenRef.current || !stillCurrent) {
          const anyRunning = streamsRef.current["en-US"].running || streamsRef.current["he-IL"].running;
          if (!anyRunning && !shouldListenRef.current) setIsListening(false);
          return;
        }

        const sibling: SpeechLang = lang === "en-US" ? "he-IL" : "en-US";
        const siblingRunning = streamsRef.current[sibling].running;
        if (siblingRunning && !streamsRef.current[lang].text) {
          return;
        }

        try {
          recognition.start();
          streamsRef.current[lang].running = true;
        } catch {
          const anyRunning = streamsRef.current["en-US"].running || streamsRef.current["he-IL"].running;
          if (!anyRunning) setIsListening(false);
        }
      };

      recognizersRef.current[lang] = recognition;
      try {
        recognition.start();
        return true;
      } catch {
        streamsRef.current[lang].running = false;
        delete recognizersRef.current[lang];
        return false;
      }
    },
    [publishTranscript],
  );

  startRecognizerRef.current = startRecognizer;

  useEffect(() => {
    const tts = typeof window !== "undefined" && "speechSynthesis" in window;
    const stt = Boolean(getRecognitionConstructor());
    setSpeechSupported({ tts, stt });
    setSpeechLang(inferBrowserSpeechLang());

    if (!tts) return;

    const loadVoices = () => {
      voiceRef.current = pickEnglishVoice(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener("voiceschanged", loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener("voiceschanged", loadVoices);
      window.speechSynthesis.cancel();
      shouldListenRef.current = false;
      stopAllRecognizers();
    };
  }, [stopAllRecognizers]);

  const speak = useCallback((text: string) => {
    if (!text.trim() || typeof window === "undefined" || !("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-US";
    utterance.rate = 0.95;
    utterance.pitch = 1.05;
    if (voiceRef.current) utterance.voice = voiceRef.current;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    publishTranscript();
    stopAllRecognizers();
    setIsListening(false);
  }, [publishTranscript, stopAllRecognizers]);

  const startListening = useCallback(
    (preferredLang?: SpeechLang) => {
      const Recognition = getRecognitionConstructor();
      if (!Recognition) return false;

      shouldListenRef.current = false;
      stopAllRecognizers();

      const preferred = preferredLang ?? inferBrowserSpeechLang();
      preferredLangRef.current = preferred;
      switchedForGibberishRef.current = false;
      streamsRef.current = emptyStreams();
      setTranscript("");
      setSpeechLang(preferred);
      shouldListenRef.current = true;
      setIsListening(true);

      const secondary: SpeechLang = preferred === "he-IL" ? "en-US" : "he-IL";
      const primaryStarted = startRecognizer(preferred);
      const secondaryStarted = startRecognizer(secondary);

      if (!primaryStarted && !secondaryStarted) {
        shouldListenRef.current = false;
        setIsListening(false);
        return false;
      }

      return true;
    },
    [startRecognizer, stopAllRecognizers],
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
    stopSpeaking,
    startListening,
    stopListening,
    toggleListening,
    isListening,
    isSpeaking,
    transcript,
    speechLang,
    speechSupported,
  };
}
