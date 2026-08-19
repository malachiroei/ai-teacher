"use client";

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Mic, Send, Volume2, VolumeX } from "lucide-react";
import { MixedBidiText } from "@/components/MixedBidiText";
import { VoiceWave, type VoiceWaveMode } from "@/components/VoiceWave";
import { getSpeechAudioContext } from "@/hooks/useSpeech";
import { splitCaptionLines } from "@/lib/hebrew";
import { getCharacter, isCharacterId, SELECTED_TUTOR_STORAGE_KEY, type Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface VoiceStageProps {
  character: Character;
  tutorName: string;
  thinking?: boolean;
  speaking?: boolean;
  listening?: boolean;
  transcript?: string;
  aiCaption?: string;
  aiTranslation?: string;
  autoSpeak: boolean;
  voiceSpeed: string;
  audioLevel?: number;
  audioLevelRef?: { current: number };
  disabled?: boolean;
  onToggleMic: () => void;
  onToggleSpeak: () => void;
  onCycleVoiceSpeed: () => void;
  onOpenCharacters: () => void;
  onSendText: (text: string) => void;
}

function useTalkingFace(speaking: boolean) {
  const mouthRef = useRef<HTMLDivElement>(null);
  const levelRef = useRef(0);
  const [blinking, setBlinking] = useState(false);

  useEffect(() => {
    let waitTimer = 0;
    let closeTimer = 0;
    const schedule = () => {
      waitTimer = window.setTimeout(() => {
        setBlinking(true);
        closeTimer = window.setTimeout(() => {
          setBlinking(false);
          schedule();
        }, 150);
      }, 4000 + Math.random() * 1000);
    };
    schedule();
    return () => {
      window.clearTimeout(waitTimer);
      window.clearTimeout(closeTimer);
    };
  }, []);

  useEffect(() => {
    const mouth = mouthRef.current;
    if (!mouth) return;
    if (!speaking) {
      mouth.style.transform = "translate(-50%, 0) scaleY(1)";
      mouth.style.opacity = "0";
      levelRef.current = 0;
      return;
    }

    let raf = 0;
    let osc: OscillatorNode | null = null;
    let gain: GainNode | null = null;
    let analyser: AnalyserNode | null = null;
    let samples: Uint8Array<ArrayBuffer> | null = null;
    const started = performance.now();

    try {
      const ctx = getSpeechAudioContext();
      if (ctx) {
        if (ctx.state === "suspended") void ctx.resume();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
        osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = 10;
        gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(analyser);
        analyser.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
      }
    } catch {
      analyser = null;
    }

    const tick = (now: number) => {
      const t = (now - started) / 1000;
      const freq = 8 + 4 * (0.5 + 0.5 * Math.sin(t * 0.85));
      let amp = 0.5 + 0.5 * Math.sin(t * Math.PI * 2 * freq);
      const burst = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5.1));
      if (analyser && samples) {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (let i = 0; i < samples.length; i += 1) {
          const sample = samples[i] ?? 128;
          const centered = (sample - 128) / 128;
          sum += centered * centered;
        }
        amp = Math.min(1, Math.sqrt(sum / samples.length) * 3.2);
      }
      const open = 1 + amp * burst * 0.6;
      levelRef.current = Math.max(0.18, Math.min(1, amp * burst));
      mouth.style.transform = `translate(-50%, 0) scaleY(${open.toFixed(3)})`;
      mouth.style.opacity = (0.18 + amp * burst * 0.48).toFixed(3);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      try {
        osc?.stop();
      } catch {
        /* already stopped */
      }
      osc?.disconnect();
      analyser?.disconnect();
      gain?.disconnect();
      mouth.style.transform = "translate(-50%, 0) scaleY(1)";
      mouth.style.opacity = "0";
      levelRef.current = 0;
    };
  }, [speaking]);

  return { mouthRef, blinking, levelRef };
}

export function VoiceStage({
  character,
  tutorName,
  thinking = false,
  speaking = false,
  listening = false,
  transcript = "",
  aiCaption = "",
  aiTranslation = "",
  autoSpeak,
  voiceSpeed,
  audioLevel = 0,
  audioLevelRef,
  disabled,
  onToggleMic,
  onToggleSpeak,
  onCycleVoiceSpeed,
  onOpenCharacters,
  onSendText,
}: VoiceStageProps) {
  const [portraitSrc, setPortraitSrc] = useState<string | null>(null);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const micTouchRef = useRef(false);
  const speakTouchRef = useRef(false);
  const shownSrcRef = useRef<string | null>(null);
  const { mouthRef, blinking, levelRef } = useTalkingFace(speaking);

  function bindImmediateTap(fromTouch: { current: boolean }, handler: () => void) {
    return {
      onTouchStart: (event: TouchEvent<HTMLButtonElement>) => {
        fromTouch.current = true;
        handler();
        event.preventDefault();
      },
      onClick: (event: MouseEvent<HTMLButtonElement>) => {
        if (fromTouch.current) {
          fromTouch.current = false;
          event.preventDefault();
          return;
        }
        handler();
      },
    };
  }
  const mode: VoiceWaveMode = speaking ? "speaking" : thinking ? "thinking" : listening ? "listening" : "idle";
  const liveWave = speaking || thinking || (listening && audioLevel >= 0.05);
  const trimmedTranscript = transcript.trim();
  const statusCaption = thinking && !aiCaption.trim()
    ? `${tutorName} is thinking...`
    : listening
      ? trimmedTranscript
        ? `Listening: ${trimmedTranscript}`
        : "Listening…"
      : !speaking && !aiCaption.trim()
        ? "Tap mic to talk"
        : "";
  const captionLines = !listening || thinking ? splitCaptionLines(aiCaption, aiTranslation) : { english: "", hebrew: "" };
  const showAiCaption = (!listening || thinking) && Boolean(captionLines.english);
  const showStatus = Boolean(statusCaption) && !showAiCaption;

  useLayoutEffect(() => {
    let storedId: string | null = null;
    try {
      storedId = window.localStorage.getItem(SELECTED_TUTOR_STORAGE_KEY);
    } catch {
      storedId = null;
    }
    const id = isCharacterId(storedId) ? storedId : character.id;
    const next = getCharacter(id).portraitUrl ?? getCharacter(id).avatarUrl;
    if (shownSrcRef.current === next) {
      setPortraitSrc(next);
      return;
    }
    const preloaded = new Image();
    preloaded.onload = () => {
      shownSrcRef.current = next;
      setPortraitSrc(next);
      setPortraitFailed(false);
    };
    preloaded.onerror = () => {
      shownSrcRef.current = next;
      setPortraitSrc(next);
    };
    preloaded.src = next;
    if (preloaded.complete && preloaded.naturalWidth > 0) {
      shownSrcRef.current = next;
      setPortraitSrc(next);
      setPortraitFailed(false);
    }
  }, [character.id, character.avatarUrl, character.portraitUrl]);

  function submitDraft() {
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    onSendText(text);
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-[#050805]">
      <button
        type="button"
        className="absolute inset-x-0 top-0 bottom-[30%] z-0 cursor-default"
        aria-label={`Change tutor. Current: ${tutorName}`}
        onClick={onOpenCharacters}
      >
        <div
          className={cn(
            "avatar-portrait absolute inset-[-10%_0_8%]",
            speaking ? "avatar-portrait-speaking" : "avatar-portrait-idle",
          )}
        >
          {portraitSrc && !portraitFailed ? (
            <img
              src={portraitSrc}
              alt=""
              className="h-full w-full object-cover object-[center_18%] select-none"
              draggable={false}
              suppressHydrationWarning
              onError={() => setPortraitFailed(true)}
            />
          ) : null}
          <div className={cn("avatar-blink", blinking && "is-blink")} aria-hidden />
          <div ref={mouthRef} className={cn("avatar-mouth", speaking && "is-speaking")} aria-hidden />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] bg-gradient-to-t from-[#050805] via-[#050805]/88 to-transparent" />
      </button>

      <div className="pointer-events-none relative z-10 flex flex-col items-center px-6 pt-[calc(2.75rem+env(safe-area-inset-top))]">
        <p className="text-[13px] font-medium tracking-[0.28em] text-white/55 uppercase">{character.title}</p>
        <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-white drop-shadow-[0_2px_18px_rgba(0,0,0,0.45)]">
          {tutorName}
        </h1>
      </div>

      <div
        className="relative z-20 mt-auto px-6 pb-[max(1rem,env(safe-area-inset-bottom))]"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {!showAiCaption && !showStatus ? (
          <p className="mb-2 text-center text-[12px] font-medium tracking-[0.18em] text-white/55 uppercase">
            Speaking with {tutorName}
          </p>
        ) : null}

        <div className="mb-3 flex min-h-[3.5rem] items-end justify-center">
          <AnimatePresence mode="wait">
            {showStatus ? (
              statusCaption === "Tap mic to talk" || listening ? (
                <motion.button
                  key={listening ? "listen" : "idle"}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  dir="ltr"
                  disabled={Boolean(disabled && !listening)}
                  className="voice-subtitle max-w-[22rem] cursor-pointer text-center text-[15px] font-medium leading-snug text-white transition-transform active:scale-95"
                  {...bindImmediateTap(micTouchRef, onToggleMic)}
                >
                  {statusCaption}
                </motion.button>
              ) : (
                <motion.p
                  key={thinking ? "think" : "status"}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.2 }}
                  dir="ltr"
                  className="voice-subtitle max-w-[22rem] text-center text-[15px] font-medium leading-snug text-white"
                >
                  {statusCaption}
                </motion.p>
              )
            ) : showAiCaption ? (
              <motion.div
                key="caption"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="voice-subtitle flex max-w-[22rem] flex-col items-center gap-1 text-center"
              >
                <p dir="ltr" className="text-[15px] font-medium leading-snug text-white">
                  {captionLines.english}
                </p>
                {captionLines.hebrew ? (
                  <p dir="rtl" className="text-sm leading-snug text-gray-300 [unicode-bidi:isolate]">
                    <MixedBidiText text={captionLines.hebrew} />
                  </p>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <AnimatePresence initial={false}>
          {keyboardOpen ? (
            <motion.form
              key="keyboard"
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 8, height: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="mb-3 overflow-hidden"
              onSubmit={(event) => {
                event.preventDefault();
                submitDraft();
              }}
            >
              <div className="flex items-center gap-2 rounded-full border border-white/14 bg-white/10 px-2 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-xl">
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Type a message…"
                  disabled={disabled}
                  autoFocus
                  className="min-w-0 flex-1 bg-transparent px-3 py-2 text-[15px] text-white outline-none placeholder:text-white/35"
                />
                <button
                  type="submit"
                  disabled={disabled || !draft.trim()}
                  aria-label="Send message"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[#04140a] transition enabled:hover:brightness-110 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </motion.form>
          ) : null}
        </AnimatePresence>

        <div className={cn("relative mx-[-0.5rem]", liveWave && "wave-glow")}>
          <VoiceWave
            mode={mode}
            color={character.accentColor}
            levelRef={listening && audioLevelRef ? audioLevelRef : levelRef}
          />
        </div>
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            disabled={disabled && !listening}
            aria-label={listening ? "Stop listening" : "Start listening"}
            className={cn(
              "flex h-16 w-16 touch-manipulation items-center justify-center rounded-full text-white transition active:scale-95",
              listening
                ? "bg-[var(--accent)] shadow-[0_0_36px_color-mix(in_srgb,var(--accent)_70%,transparent)]"
                : "bg-white/8 ring-1 ring-white/15 shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_28%,transparent)] hover:bg-white/12",
            )}
            {...bindImmediateTap(micTouchRef, onToggleMic)}
          >
            <Mic className="h-7 w-7" />
          </button>
          <button
            type="button"
            onClick={() => setKeyboardOpen((open) => !open)}
            aria-label={keyboardOpen ? "Hide keyboard" : "Show keyboard"}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-white/12 transition hover:bg-white/10",
              keyboardOpen ? "bg-white/12 text-white" : "bg-white/8 text-white/70",
            )}
          >
            <Keyboard className="h-5 w-5" />
          </button>
          <button
            type="button"
            aria-label={autoSpeak ? "Mute voice replies" : "Unmute voice replies"}
            className={cn(
              "flex h-12 w-12 touch-manipulation items-center justify-center rounded-full ring-1 ring-white/12 transition hover:bg-white/10",
              autoSpeak ? "bg-white/8 text-white" : "bg-white/5 text-white/40",
            )}
            {...bindImmediateTap(speakTouchRef, onToggleSpeak)}
          >
            {autoSpeak ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onCycleVoiceSpeed}
            aria-label={`Voice speed ${voiceSpeed}. Tap to change.`}
            className="flex h-12 min-w-[3.35rem] items-center justify-center rounded-full bg-white/8 px-3 text-[13px] font-semibold tracking-wide text-white/85 ring-1 ring-white/12 backdrop-blur-md transition hover:bg-white/12"
          >
            {voiceSpeed}
          </button>
        </div>
      </div>
    </div>
  );
}
