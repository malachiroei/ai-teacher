"use client";

import { BuddyAIMark } from "@/components/BuddyAIMark";
import { Menu } from "lucide-react";
import { SideDrawer } from "@/components/SideDrawer";
import type { Character } from "@/lib/characters";
import { progressInLevel } from "@/lib/progression";

interface ChatTopBarProps {
  character: Character;
  autoSpeak: boolean;
  onToggleSpeak: () => void;
  onOpenCharacters: () => void;
  onOpenVoiceSettings: () => void;
  onOpenHistory: () => void;
  onOpenTranscript: () => void;
  recording?: boolean;
  recorderSupported?: boolean;
  hasRecordingClip?: boolean;
  onToggleRecording?: () => void;
  onDownloadRecording?: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onClearChat: () => void;
  onOpenSettings: () => void;
  onOpenProgress?: () => void;
  onEditProfile?: () => void;
  onSignOut?: () => void;
  practicedMinutes: number;
  dailyGoalMinutes: number;
  xp: number;
  level: number;
  showProfileReminder?: boolean;
  onOpenProfileReminder?: () => void;
}

export function ChatTopBar({
  character,
  autoSpeak,
  onToggleSpeak,
  onOpenCharacters,
  onOpenVoiceSettings,
  onOpenHistory,
  onOpenTranscript,
  recording,
  recorderSupported,
  hasRecordingClip,
  onToggleRecording,
  onDownloadRecording,
  menuOpen,
  onToggleMenu,
  onClearChat,
  onOpenSettings,
  onOpenProgress,
  onEditProfile,
  onSignOut,
  practicedMinutes,
  dailyGoalMinutes,
  xp,
  level,
  showProfileReminder,
  onOpenProfileReminder,
}: ChatTopBarProps) {
  const goal = Math.max(1, dailyGoalMinutes);
  const done = Math.min(practicedMinutes, goal);
  const reached = practicedMinutes >= goal;
  const progress = progressInLevel(xp);
  const title = progress.current.title;
  const emoji = progress.current.emoji;

  return (
    <>
      <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-between px-3 pt-[max(0.45rem,env(safe-area-inset-top))]">
        <div className="flex min-w-0 items-center gap-2">
          <BuddyAIMark className="h-7 w-7 shrink-0 rounded-[0.65rem] shadow-[0_0_16px_rgba(61,255,208,0.22)]" />
          <button
            type="button"
            onClick={onOpenProgress ?? onOpenSettings}
            aria-label={`Level ${level} ${title}, ${xp} XP. Daily goal ${done} of ${goal} minutes`}
            className="min-w-0 rounded-2xl px-1.5 py-0.5 text-left transition hover:bg-white/8"
          >
            <p className="truncate text-[10px] font-semibold tracking-wide text-white/80">
              {emoji} Lv.{progress.current.level} {title}
              <span className="ml-1 font-medium text-white/45">({xp} XP)</span>
            </p>
            <div className="mt-0.5 h-1 w-[7.5rem] overflow-hidden rounded-full bg-white/12">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300 transition-[width] duration-500"
                style={{ width: `${progress.percent}%` }}
              />
            </div>
            <p className="mt-0.5 text-[9px] font-medium text-white/35">
              {reached ? "🎉" : "🔥"} {done}/{goal} min
            </p>
          </button>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          suppressHydrationWarning
          onClick={onToggleMenu}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white/80"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      {showProfileReminder ? (
        <div className="absolute left-1/2 top-[calc(2.35rem+env(safe-area-inset-top))] z-[55] w-[90%] max-w-md -translate-x-1/2">
          <button
            type="button"
            dir="rtl"
            onClick={onOpenProfileReminder}
            className="flex w-full cursor-pointer items-center justify-between rounded-xl border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs text-amber-200 transition-all hover:bg-amber-500/30"
          >
            <span className="truncate">🎯 השלם את שאלון ההיכרות כדי שנתאים לך את השיחה!</span>
            <span className="ml-2 shrink-0 rounded bg-amber-500/30 px-2 py-0.5 text-[10px] font-semibold">התחל ←</span>
          </button>
        </div>
      ) : null}

      <SideDrawer
        open={menuOpen}
        character={character}
        autoSpeak={autoSpeak}
        practicedMinutes={practicedMinutes}
        dailyGoalMinutes={dailyGoalMinutes}
        xp={xp}
        level={level}
        levelTitle={title}
        levelEmoji={emoji}
        levelPercent={progress.percent}
        onClose={() => {
          if (menuOpen) onToggleMenu();
        }}
        onToggleSpeak={onToggleSpeak}
        onOpenCharacters={onOpenCharacters}
        onOpenSettings={onOpenSettings}
        onOpenProgress={onOpenProgress}
        onEditProfile={onEditProfile}
        onOpenVoiceSettings={onOpenVoiceSettings}
        onOpenHistory={onOpenHistory}
        onOpenTranscript={onOpenTranscript}
        recording={recording}
        recorderSupported={recorderSupported}
        hasRecordingClip={hasRecordingClip}
        onToggleRecording={onToggleRecording}
        onDownloadRecording={onDownloadRecording}
        onClearChat={onClearChat}
        onSignOut={onSignOut}
      />
    </>
  );
}
