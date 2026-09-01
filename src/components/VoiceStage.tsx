"use client";

import { memo, useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, Keyboard, Mic, RefreshCw, Send, Sparkles, Volume1, Volume2, VolumeX } from "lucide-react";
import { VoiceWave, type VoiceWaveMode } from "@/components/VoiceWave";
import { Avatar3DStage } from "@/components/Avatar3DStage";
import { ChatSubtitleBox } from "@/components/ChatSubtitleBox";
import { splitCaptionLines } from "@/lib/hebrew";
import { hasHebrewScript } from "@/lib/language";
import { type Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

export type ChatSurfaceMode = "lesson" | "practice";

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
  onSetVolume: (volume: number) => void;
  audioLevel?: number;
  audioLevelRef?: { current: number };
  disabled?: boolean;
  onToggleMic: () => void;
  onChangeTopic?: () => void;
  onStartQuickGame?: () => void;
  gameOverlay?: ReactNode;
  onToggleSpeak: () => void;
  onCycleVoiceSpeed: () => void;
  onOpenCharacters: () => void;
  onSendText: (text: string) => void;
  offsetForBanner?: boolean;
  childName?: string;
  onReplayCaption?: () => void;
  onOpenPractice?: () => void;
  silenceHint?: string;
  chatMode?: ChatSurfaceMode;
  onChatModeChange?: (mode: ChatSurfaceMode) => void;
  quickReplies?: string[];
  onQuickReply?: (text: string) => void;
}

const AvatarCanvasLayer = memo(function AvatarCanvasLayer({
  character,
  tutorName,
  isSpeakingRef,
  spokenTextRef,
  mouthLevelRef,
  onOpenCharacters,
  speaking,
}: {
  character: Character;
  tutorName: string;
  isSpeakingRef: { current: boolean };
  spokenTextRef: { current: string };
  mouthLevelRef: { current: number };
  onOpenCharacters: () => void;
  speaking?: boolean;
}) {
  return (
    <button
      type="button"
      className="relative h-full w-full cursor-default overflow-hidden"
      aria-label={`Change tutor. Current: ${tutorName}`}
      onClick={onOpenCharacters}
    >
      <div className="avatar-stage-glow pointer-events-none absolute inset-[8%_12%_12%] rounded-[50%]" aria-hidden />
      <div className="avatar-display-shell relative h-full w-full">
        <div className="avatar-particles pointer-events-none absolute inset-0" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <span
              key={i}
              className="avatar-particle"
              style={{
                left: `${14 + ((i * 13) % 72)}%`,
                top: `${20 + ((i * 15) % 50)}%`,
                animationDelay: `${i * 0.4}s`,
                backgroundColor: character.accentColor,
              }}
            />
          ))}
        </div>
        <div
          className={cn(
            "avatar-holo-aura pointer-events-none absolute inset-[4%_14%] rounded-[50%]",
            speaking ? "avatar-holo-aura-speaking" : "avatar-holo-aura-idle",
          )}
          style={{ boxShadow: `0 0 60px ${character.accentColor}50` }}
        />
        <div className="avatar-portrait avatar-portrait-3d avatar-portrait-idle absolute inset-0">
          <Avatar3DStage
            character={character}
            isSpeakingRef={isSpeakingRef}
            spokenTextRef={spokenTextRef}
            mouthLevelRef={mouthLevelRef}
          />
        </div>
      </div>
    </button>
  );
}, (prev, next) =>
  prev.character.id === next.character.id && prev.tutorName === next.tutorName && prev.speaking === next.speaking,
);

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
  onChangeTopic,
  onStartQuickGame,
  gameOverlay,
  onToggleSpeak,
  onCycleVoiceSpeed,
  onOpenCharacters,
  onSetVolume,
  onSendText,
  offsetForBanner = false,
  childName = "You",
  onReplayCaption,
  onOpenPractice,
  silenceHint = "",
  chatMode = "lesson",
  onChatModeChange,
  quickReplies = [],
  onQuickReply,
}: VoiceStageProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const micTouchRef = useRef(false);
  const speakTouchRef = useRef(false);
  const mouthLevelRef3d = useRef(0);
  const isSpeakingRef = useRef(speaking);
  const spokenTextRef = useRef(speakingText ?? "");
  isSpeakingRef.current = speaking;
  spokenTextRef.current = speakingText ?? "";

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
  const childLine = listening ? trimmedTranscript : "";
  const captionLines = splitCaptionLines(aiCaption, aiTranslation);
  const hebrewPrimary = hasHebrewScript(aiCaption);
  const tutorLine = hebrewPrimary ? captionLines.hebrew || aiCaption : captionLines.english;
  const tutorSubtitle = hebrewPrimary ? captionLines.english : captionLines.hebrew;
  const idleHint =
    thinking || childLine || tutorLine
      ? ""
      : silenceHint
        ? silenceHint
        : listening
          ? "Listening…"
          : "Tap mic to talk";

  function submitDraft() {
    const text = draft.trim();
    if (!text || disabled) return;
    setDraft("");
    onSendText(text);
  }

  return (
    <div className="voice-stage-bg flex h-full min-h-0 w-full flex-col justify-between overflow-hidden">
      {/* Header — shrink-0, never overlays avatar */}
      <header
        className={cn(
          "z-20 flex shrink-0 flex-col px-4",
          offsetForBanner
            ? "pt-[calc(4rem+env(safe-area-inset-top))]"
            : "pt-[calc(1.75rem+env(safe-area-inset-top))]",
        )}
      >
        {onChatModeChange ? (
          <div className="mb-0.5 flex rounded-full border border-white/20 bg-slate-900/45 p-0.5 shadow-lg backdrop-blur-xl">
            {(
              [
                { id: "lesson" as const, label: "📖 שיעור", sub: "Lesson" },
                { id: "practice" as const, label: "🎭 תרגול", sub: "Practice" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => onChatModeChange(tab.id)}
                className={cn(
                  "rounded-full px-3 py-0.5 text-[11px] font-bold transition",
                  chatMode === tab.id ? "bg-white text-slate-900 shadow-md" : "text-white/85 hover:bg-white/10",
                )}
              >
                {tab.label}
                <span className="ml-1 hidden text-[9px] font-semibold opacity-70 sm:inline">({tab.sub})</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="my-1 flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[15px] font-semibold leading-tight tracking-tight text-white">{tutorName}</h1>
            <p className="truncate text-[9px] font-semibold tracking-[0.18em] text-sky-100/65 uppercase">{character.title}</p>
          </div>

          {(onChangeTopic || onOpenPractice) && (
            <div className="flex shrink-0 items-center gap-1">
              {onOpenPractice ? (
                <button
                  type="button"
                  disabled={Boolean(disabled)}
                  onClick={onOpenPractice}
                  aria-label="Learn and play"
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-300/35 bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-50 backdrop-blur-md transition hover:bg-emerald-400/25 disabled:opacity-40"
                >
                  <BookOpen className="h-3 w-3" aria-hidden />
                  Play
                </button>
              ) : null}
              {onChangeTopic ? (
                <button
                  type="button"
                  disabled={Boolean(disabled)}
                  onClick={onChangeTopic}
                  aria-label="Change topic"
                  className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/90 backdrop-blur-md transition hover:bg-white/16 disabled:opacity-40"
                >
                  <RefreshCw className="h-3 w-3 opacity-80" aria-hidden />
                  Topic
                </button>
              ) : null}
            </div>
          )}
        </div>
      </header>

      {/* Avatar stage — fixed portrait band */}
      <div className="relative z-0 h-[35vh] max-h-[35vh] shrink-0 w-full overflow-hidden">
        <div className="h-full w-full max-w-lg">
          <AvatarCanvasLayer
            character={character}
            tutorName={tutorName}
            isSpeakingRef={isSpeakingRef}
            spokenTextRef={spokenTextRef}
            mouthLevelRef={mouthLevelRef3d}
            onOpenCharacters={onOpenCharacters}
            speaking={speaking}
          />
        </div>
      </div>

      {/* Controls — shrink-0 only; never climbs into avatar */}
      <div
        className="z-20 flex min-h-0 shrink-0 flex-col gap-2 overflow-hidden px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-0"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <ChatSubtitleBox
          tutorName={tutorName}
          childName={childName}
          tutorLine={tutorLine}
          tutorHebrew={tutorSubtitle}
          childLine={childLine}
          listening={listening}
          thinking={thinking}
          idleHint={idleHint}
          onIdleHintTap={
            silenceHint ? onOpenPractice : idleHint === "Tap mic to talk" ? onToggleMic : undefined
          }
          onReplayTutor={tutorLine && onReplayCaption ? onReplayCaption : undefined}
        />

        {quickReplies.length > 0 && onQuickReply ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {quickReplies.slice(0, 2).map((chip) => (
              <button
                key={chip}
                type="button"
                disabled={Boolean(disabled)}
                onClick={() => onQuickReply(chip.replace(/^[^\s]+\s/, "").trim() || chip)}
                className="quick-reply-chip rounded-full border border-sky-200/30 bg-white/14 px-3 py-1.5 text-[13px] font-bold text-white shadow-[0_6px_20px_rgba(0,0,0,0.22)] backdrop-blur-md transition hover:scale-[1.03] hover:bg-white/20 active:scale-[0.98] disabled:opacity-40"
              >
                {chip}
              </button>
            ))}
          </div>
        ) : null}

        <AnimatePresence initial={false}>
          {keyboardOpen ? (
            <motion.form
              key="keyboard"
              initial={{ opacity: 0, y: 8, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: 6, height: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="overflow-hidden"
              onSubmit={(event) => {
                event.preventDefault();
                submitDraft();
              }}
            >
              <div className="flex items-center gap-2 rounded-full border border-white/18 bg-slate-900/45 px-2 py-1.5 shadow-[0_8px_28px_rgba(0,0,0,0.28)] backdrop-blur-xl">
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

        {gameOverlay}

        <div className={cn("relative mx-[-0.25rem]", liveWave && "wave-glow")}>
          <VoiceWave
            mode={mode}
            color={character.accentColor}
            levelRef={listening && audioLevelRef ? audioLevelRef : mouthLevelRef3d}
          />
        </div>

        <div className="flex items-center justify-center gap-5">
          {onStartQuickGame ? (
            <button
              type="button"
              disabled={Boolean(disabled)}
              onClick={onStartQuickGame}
              aria-label="Quick game"
              className="flex h-14 min-w-[3.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl border border-amber-300/40 bg-amber-400/15 px-3 text-amber-50 shadow-[0_8px_22px_rgba(251,191,36,0.16)] backdrop-blur-md transition hover:bg-amber-400/25 active:scale-[0.97] disabled:opacity-40"
            >
              <Sparkles className="h-5 w-5" aria-hidden />
              <span className="text-[10px] font-bold tracking-wide">Game</span>
            </button>
          ) : (
            <span className="w-14" aria-hidden />
          )}

          <div className="relative">
            {listening ? <span className="mic-pulse-ring pointer-events-none absolute inset-0 rounded-full" /> : null}
            <button
              type="button"
              disabled={disabled && !listening}
              aria-label={listening ? "Stop listening" : "Start listening"}
              className={cn(
                "relative flex h-[4.75rem] w-[4.75rem] touch-manipulation items-center justify-center rounded-full text-white transition active:scale-95",
                listening
                  ? "bg-[var(--accent)] shadow-[0_0_48px_color-mix(in_srgb,var(--accent)_75%,transparent)]"
                  : "bg-gradient-to-br from-sky-400/35 to-indigo-500/40 ring-2 ring-white/25 shadow-[0_0_36px_color-mix(in_srgb,var(--accent)_40%,transparent)] hover:brightness-110",
              )}
              {...bindImmediateTap(micTouchRef, onToggleMic)}
            >
              <Mic className={cn("h-8 w-8", listening && "animate-pulse")} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setKeyboardOpen((open) => !open)}
            aria-label={keyboardOpen ? "Hide keyboard" : "Show keyboard"}
            className={cn(
              "flex h-14 min-w-[3.5rem] flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/18 backdrop-blur-md transition",
              keyboardOpen ? "bg-white/18 text-white" : "bg-white/10 text-white/80 hover:bg-white/16",
            )}
          >
            <Keyboard className="h-5 w-5" />
            <span className="text-[10px] font-bold tracking-wide">Type</span>
          </button>
        </div>

        <div className="flex items-center justify-center gap-2">
          <VolumeControls
            autoSpeak={autoSpeak}
            onToggleSpeak={onToggleSpeak}
            onSetVolume={onSetVolume}
            speakTouchRef={speakTouchRef}
            bindImmediateTap={bindImmediateTap}
          />
          <button
            type="button"
            onClick={onCycleVoiceSpeed}
            aria-label={`Voice speed ${voiceSpeed}. Tap to change.`}
            className="flex h-10 min-w-[3rem] items-center justify-center rounded-full bg-white/10 px-3 text-[12px] font-semibold tracking-wide text-white/85 ring-1 ring-white/15 backdrop-blur-md transition hover:bg-white/16"
          >
            {voiceSpeed}
          </button>
        </div>
      </div>
    </div>
  );
}

function VolumeControls({
  autoSpeak,
  onToggleSpeak,
  onSetVolume,
  speakTouchRef,
  bindImmediateTap,
}: {
  autoSpeak: boolean;
  onToggleSpeak: () => void;
  onSetVolume: (volume: number) => void;
  speakTouchRef: { current: boolean };
  bindImmediateTap: (
    fromTouch: { current: boolean },
    handler: () => void,
  ) => {
    onTouchStart: (event: TouchEvent<HTMLButtonElement>) => void;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  };
}) {
  const [volumeIcon, setVolumeIcon] = useState<"mute" | "low" | "high">(autoSpeak ? "high" : "mute");

  function applyVolumeLive(raw: number) {
    const v = Math.max(0, Math.min(1, raw));
    onSetVolume(v);
    const nextIcon = v === 0 || !autoSpeak ? "mute" : v < 0.45 ? "low" : "high";
    setVolumeIcon((current) => (current === nextIcon ? current : nextIcon));
  }

  return (
    <>
      <button
        type="button"
        aria-label={autoSpeak ? "Mute voice replies" : "Unmute voice replies"}
        className={cn(
          "flex h-10 w-10 touch-manipulation items-center justify-center rounded-full ring-1 ring-white/15 transition hover:bg-white/12",
          autoSpeak ? "bg-white/10 text-white" : "bg-white/5 text-white/40",
        )}
        {...bindImmediateTap(speakTouchRef, onToggleSpeak)}
      >
        {!autoSpeak || volumeIcon === "mute" ? (
          <VolumeX className="h-4 w-4" />
        ) : volumeIcon === "low" ? (
          <Volume1 className="h-4 w-4" />
        ) : (
          <Volume2 className="h-4 w-4" />
        )}
      </button>
      <div className="flex h-10 w-24 items-center gap-2 rounded-full bg-white/10 px-2.5 ring-1 ring-white/15 backdrop-blur-md sm:w-28">
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          defaultValue={1}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => applyVolumeLive(Number((e.target as HTMLInputElement).value))}
          onTouchEnd={(e) => applyVolumeLive(Number((e.target as HTMLInputElement).value))}
          onInput={(e) => applyVolumeLive(Number((e.target as HTMLInputElement).value))}
          onChange={(e) => applyVolumeLive(Number(e.target.value))}
          aria-label="Voice volume"
          className="voice-volume-slider h-5 w-full cursor-pointer accent-sky-300"
        />
      </div>
    </>
  );
}
