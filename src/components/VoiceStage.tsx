"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Mic, Send, Volume2, VolumeX } from "lucide-react";
import { MixedBidiText } from "@/components/MixedBidiText";
import { VoiceWave, type VoiceWaveMode } from "@/components/VoiceWave";
import { splitCaptionLines } from "@/lib/hebrew";
import type { Character } from "@/lib/characters";
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
  disabled?: boolean;
  onToggleMic: () => void;
  onToggleSpeak: () => void;
  onCycleVoiceSpeed: () => void;
  onOpenCharacters: () => void;
  onSendText: (text: string) => void;
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
  disabled,
  onToggleMic,
  onToggleSpeak,
  onCycleVoiceSpeed,
  onOpenCharacters,
  onSendText,
}: VoiceStageProps) {
  const portrait = character.portraitUrl ?? character.avatarUrl;
  const [portraitSrc, setPortraitSrc] = useState(portrait);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const mode: VoiceWaveMode = speaking ? "speaking" : listening ? "listening" : "idle";
  const live = speaking || listening;
  const trimmedTranscript = transcript.trim();
  const statusCaption = listening
    ? trimmedTranscript
      ? `Listening: ${trimmedTranscript}`
      : "Listening…"
    : thinking && !aiCaption.trim()
      ? `${tutorName} is thinking...`
      : "";
  const captionLines = !listening ? splitCaptionLines(aiCaption, aiTranslation) : { english: "", hebrew: "" };
  const showAiCaption = !listening && Boolean(captionLines.english);
  const showStatus = Boolean(statusCaption) && !showAiCaption;

  useEffect(() => {
    setPortraitSrc(portrait);
    setPortraitFailed(false);
  }, [portrait]);

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
        <div className={cn("living-being absolute inset-[-10%_0_8%]", speaking && "living-being-talk", thinking && "living-being-think")}>
          {portraitFailed ? (
            <div
              className="h-full w-full"
              style={{
                background: `radial-gradient(circle at 50% 28%, ${character.accentColor}66, #050805 72%)`,
              }}
            />
          ) : (
            <img
              src={portraitSrc}
              alt=""
              className="h-full w-full object-cover object-[center_14%] select-none"
              draggable={false}
              onError={() => setPortraitFailed(true)}
            />
          )}
        </div>
        <div className="digital-overlay absolute inset-0" />
        <div className="digital-scan absolute inset-0" />
        <motion.div
          className="pointer-events-none absolute inset-x-0 top-[6%] h-[46%]"
          animate={{ opacity: thinking ? 1 : live ? 0.55 : 0.28, scale: thinking ? 1.08 : 1 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <div
            className="mx-auto h-full w-[78%] rounded-full blur-3xl"
            style={{
              background: `radial-gradient(circle, ${character.accentColor}aa 0%, ${character.accentColor}22 42%, transparent 70%)`,
            }}
          />
        </motion.div>
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
              <motion.p
                key={listening ? "listen" : "think"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                dir="ltr"
                className="voice-subtitle max-w-[22rem] text-center text-[15px] font-medium leading-snug text-white"
              >
                {statusCaption}
              </motion.p>
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

        <div className={cn("relative mx-[-0.5rem]", live && "wave-glow")}>
          <VoiceWave mode={mode} color={character.accentColor} />
        </div>
        <div className="mt-3 flex items-center justify-center gap-4">
          <button
            type="button"
            onClick={onToggleMic}
            disabled={disabled && !listening}
            aria-label={listening ? "Stop listening" : "Start listening"}
            className={cn(
              "flex h-16 w-16 items-center justify-center rounded-full text-white transition active:scale-95",
              listening
                ? "bg-[var(--accent)] shadow-[0_0_36px_color-mix(in_srgb,var(--accent)_70%,transparent)]"
                : "bg-white/8 ring-1 ring-white/15 shadow-[0_0_28px_color-mix(in_srgb,var(--accent)_28%,transparent)] hover:bg-white/12",
            )}
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
            onClick={onToggleSpeak}
            aria-label={autoSpeak ? "Mute voice replies" : "Unmute voice replies"}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-white/12 transition hover:bg-white/10",
              autoSpeak ? "bg-white/8 text-white" : "bg-white/5 text-white/40",
            )}
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
