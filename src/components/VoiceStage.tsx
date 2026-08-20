"use client";

import { useRef, useState, type MouseEvent, type TouchEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Keyboard, Mic, Send, Volume1, Volume2, VolumeX } from "lucide-react";
import { MixedBidiText } from "@/components/MixedBidiText";
import { VoiceWave, type VoiceWaveMode } from "@/components/VoiceWave";
import { Avatar3DStage } from "@/components/Avatar3DStage";
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
  speakingText?: string;
  autoSpeak: boolean;
  voiceSpeed: string;
  onSetVolume: (volume: number, options?: { commitMute?: boolean }) => void;
  audioLevel?: number;
  audioLevelRef?: { current: number };
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
  speakingText,
  autoSpeak,
  voiceSpeed,
  audioLevel = 0,
  audioLevelRef,
  disabled,
  onToggleMic,
  onToggleSpeak,
  onCycleVoiceSpeed,
  onOpenCharacters,
  onSetVolume,
  onSendText,
}: VoiceStageProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState("");
  // Icon bucket only — never drive the range with React state (that re-renders the 3D canvas).
  const [volumeIcon, setVolumeIcon] = useState<"mute" | "low" | "high">("high");
  const micTouchRef = useRef(false);
  const speakTouchRef = useRef(false);
  // Avatar3DStage updates this ref in real-time (jawOpen proxy) so the waveform
  // can visually respond to TTS speaking even when the mic is idle.
  const mouthLevelRef3d = useRef(0);

  function applyVolumeLive(raw: number, commitMute = false) {
    const v = Math.max(0, Math.min(1, raw));
    // Audio first — no controlled React value on the hot path.
    onSetVolume(v, { commitMute });
    const nextIcon = v === 0 || !autoSpeak ? "mute" : v < 0.45 ? "low" : "high";
    setVolumeIcon((current) => (current === nextIcon ? current : nextIcon));
  }

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
            "avatar-portrait avatar-portrait-3d absolute inset-[-10%_0_8%]",
            speaking ? "avatar-portrait-speaking" : "avatar-portrait-idle",
          )}
          style={{
            // Soft static glow only — no on/off flash between TTS chunks.
            boxShadow: speaking
              ? `0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 36px color-mix(in srgb, var(--accent) 28%, transparent)`
              : `0 0 0 1px color-mix(in srgb, var(--accent) 18%, transparent)`,
            transition: "box-shadow 0.5s ease",
          }}
        >
          <Avatar3DStage
            character={character}
            isSpeaking={speaking}
            spokenText={speakingText}
            mouthLevelRef={mouthLevelRef3d}
          />
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
                  <p
                    dir="rtl"
                    className="relative z-30 max-h-[140px] overflow-y-auto px-4 text-center text-sm leading-snug text-gray-300 [unicode-bidi:isolate]"
                  >
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
            levelRef={listening && audioLevelRef ? audioLevelRef : mouthLevelRef3d}
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
            {!autoSpeak || volumeIcon === "mute" ? (
              <VolumeX className="h-5 w-5" />
            ) : volumeIcon === "low" ? (
              <Volume1 className="h-5 w-5" />
            ) : (
              <Volume2 className="h-5 w-5" />
            )}
          </button>
          <div className="flex h-12 w-28 items-center gap-2 rounded-full bg-white/8 px-2.5 ring-1 ring-white/12 backdrop-blur-md sm:w-32">
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              defaultValue={1}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => applyVolumeLive(Number((e.target as HTMLInputElement).value), true)}
              onTouchEnd={(e) => applyVolumeLive(Number((e.target as HTMLInputElement).value), true)}
              onInput={(e) => applyVolumeLive(Number((e.target as HTMLInputElement).value), false)}
              onChange={(e) => applyVolumeLive(Number(e.target.value), false)}
              aria-label="Voice volume"
              className="voice-volume-slider h-5 w-full cursor-pointer accent-amber-400"
            />
          </div>
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
