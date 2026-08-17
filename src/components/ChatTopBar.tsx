"use client";

import { BuddyAIMark } from "@/components/BuddyAIMark";
import { Menu } from "lucide-react";
import { SideDrawer } from "@/components/SideDrawer";
import type { Character } from "@/lib/characters";

interface ChatTopBarProps {
  character: Character;
  autoSpeak: boolean;
  onToggleSpeak: () => void;
  onOpenCharacters: () => void;
  onOpenVoiceSettings: () => void;
  onOpenHistory: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onClearChat: () => void;
  onOpenSettings: () => void;
  onSignOut?: () => void;
  practicedMinutes: number;
  dailyGoalMinutes: number;
}

export function ChatTopBar({
  character,
  autoSpeak,
  onToggleSpeak,
  onOpenCharacters,
  onOpenVoiceSettings,
  onOpenHistory,
  menuOpen,
  onToggleMenu,
  onClearChat,
  onOpenSettings,
  onSignOut,
  practicedMinutes,
  dailyGoalMinutes,
}: ChatTopBarProps) {
  const goal = Math.max(1, dailyGoalMinutes);
  const done = Math.min(practicedMinutes, goal);
  const reached = practicedMinutes >= goal;

  return (
    <>
      <div className="absolute inset-x-0 top-0 z-50 flex items-center justify-between px-3 pt-[max(0.45rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <BuddyAIMark className="h-7 w-7 rounded-[0.65rem] shadow-[0_0_16px_rgba(61,255,208,0.22)]" />
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label={`Daily goal ${done} of ${goal} minutes`}
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-white/40 transition hover:text-white/70"
          >
            {reached ? "🎉" : "🔥"} {done}/{goal} min
          </button>
        </div>
        <button
          type="button"
          aria-label="Open menu"
          suppressHydrationWarning
          onClick={onToggleMenu}
          className="flex h-8 w-8 items-center justify-center rounded-full text-white/45 transition hover:bg-white/10 hover:text-white/80"
        >
          <Menu className="h-4 w-4" />
        </button>
      </div>

      <SideDrawer
        open={menuOpen}
        character={character}
        autoSpeak={autoSpeak}
        practicedMinutes={practicedMinutes}
        dailyGoalMinutes={dailyGoalMinutes}
        onClose={() => {
          if (menuOpen) onToggleMenu();
        }}
        onToggleSpeak={onToggleSpeak}
        onOpenCharacters={onOpenCharacters}
        onOpenSettings={onOpenSettings}
        onOpenVoiceSettings={onOpenVoiceSettings}
        onOpenHistory={onOpenHistory}
        onClearChat={onClearChat}
        onSignOut={onSignOut}
      />
    </>
  );
}
