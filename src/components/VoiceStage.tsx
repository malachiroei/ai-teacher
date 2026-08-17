"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, Volume2, VolumeX } from "lucide-react";
import { VoiceWave, type VoiceWaveMode } from "@/components/VoiceWave";
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
  autoSpeak: boolean;
  disabled?: boolean;
  onToggleMic: () => void;
  onToggleSpeak: () => void;
  onOpenCharacters: () => void;
}

export function VoiceStage({
  character,
  tutorName,
  thinking = false,
  speaking = false,
  listening = false,
  transcript = "",
  aiCaption = "",
  autoSpeak,
  disabled,
  onToggleMic,
  onToggleSpeak,
  onOpenCharacters,
}: VoiceStageProps) {
  const portrait = character.portraitUrl ?? character.avatarUrl;
  const [portraitSrc, setPortraitSrc] = useState(portrait);
  const [portraitFailed, setPortraitFailed] = useState(false);
  const mode: VoiceWaveMode = speaking ? "speaking" : listening ? "listening" : thinking ? "thinking" : "idle";
  const live = thinking || speaking || listening;
  const trimmedTranscript = transcript.trim();
  const subtitle = listening
    ? trimmedTranscript
      ? `Listening: ${trimmedTranscript}`
      : "Listening…"
    : speaking && aiCaption.trim()
      ? aiCaption.trim()
      : thinking
        ? `${tutorName} is thinking...`
        : aiCaption.trim();

  useEffect(() => {
    setPortraitSrc(portrait);
    setPortraitFailed(false);
  }, [portrait]);

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
        {!subtitle ? (
          <p className="mb-2 text-center text-[12px] font-medium tracking-[0.18em] text-white/55 uppercase">
            Speaking with {tutorName}
          </p>
        ) : null}

        <div className="mb-3 flex min-h-[3.5rem] items-end justify-center">
          <AnimatePresence mode="wait">
            {subtitle ? (
              <motion.p
                key={listening ? "listen" : thinking ? "think" : "speak"}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="voice-subtitle max-w-[22rem] text-center text-[15px] font-medium leading-snug text-white"
              >
                {subtitle}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </div>

        <div className={cn("relative mx-[-0.5rem]", live && "wave-glow")}>
          <VoiceWave mode={mode} color={character.accentColor} />
        </div>
        <div className="mt-3 flex items-center justify-center gap-10">
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
            onClick={onToggleSpeak}
            aria-label={autoSpeak ? "Mute voice replies" : "Unmute voice replies"}
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-full ring-1 ring-white/12 transition hover:bg-white/10",
              autoSpeak ? "bg-white/8 text-white" : "bg-white/5 text-white/40",
            )}
          >
            {autoSpeak ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
