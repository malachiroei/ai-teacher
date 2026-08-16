"use client";

import { useEffect, useState } from "react";
import { AudioLines, Check, ChevronDown, History, MoreVertical, Pencil, Volume2, VolumeX, X } from "lucide-react";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import type { Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  character: Character;
  tutorName: string;
  autoSpeak: boolean;
  onToggleSpeak: () => void;
  onOpenCharacters: () => void;
  onOpenVoiceSettings: () => void;
  onOpenHistory: () => void;
  onSaveTutorName: (name: string) => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onClearChat: () => void;
  onOpenSettings: () => void;
  onSignOut?: () => void;
  practicedMinutes: number;
  dailyGoalMinutes: number;
}

export function ChatHeader({
  character,
  tutorName,
  autoSpeak,
  onToggleSpeak,
  onOpenCharacters,
  onOpenVoiceSettings,
  onOpenHistory,
  onSaveTutorName,
  menuOpen,
  onToggleMenu,
  onClearChat,
  onOpenSettings,
  onSignOut,
  practicedMinutes,
  dailyGoalMinutes,
}: ChatHeaderProps) {
  const goal = Math.max(1, dailyGoalMinutes);
  const done = Math.min(practicedMinutes, goal);
  const percent = Math.min(100, Math.round((practicedMinutes / goal) * 100));
  const reached = practicedMinutes >= goal;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tutorName);

  useEffect(() => {
    if (!editing) setDraft(tutorName);
  }, [editing, tutorName]);

  function commitName() {
    const next = draft.trim() || character.name;
    setEditing(false);
    if (next !== tutorName) onSaveTutorName(next);
  }

  return (
    <header className="sticky top-0 z-50 shrink-0 border-b border-slate-100 bg-white/95 backdrop-blur">
      <div className="flex items-center gap-1.5 px-2 py-2.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button
            type="button"
            onClick={onOpenCharacters}
            aria-label={`Change tutor. Current: ${tutorName}`}
            className="shrink-0 rounded-full"
          >
            <CharacterAvatar character={character} className="h-10 w-10" online eager />
          </button>
          <div className="min-w-0 flex-1">
            {editing ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  commitName();
                }}
              >
                <input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onBlur={commitName}
                  autoFocus
                  maxLength={24}
                  aria-label="Tutor nickname"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[15px] font-semibold text-slate-900 outline-none focus:border-[#2f6bff]"
                />
                <button
                  type="submit"
                  aria-label="Save tutor name"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-[#2f6bff] hover:bg-blue-50"
                >
                  <Check className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    setDraft(tutorName);
                    setEditing(false);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={onOpenCharacters}
                className="block min-w-0 w-full rounded-xl py-0.5 text-left transition hover:bg-slate-50"
              >
                <p className="flex items-center gap-1 truncate text-[15px] font-semibold leading-tight text-slate-900">
                  <span className="truncate">{tutorName}</span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                </p>
                <p className="truncate text-[11px] font-medium" style={{ color: character.accentColor }}>
                  Online · {character.title}
                </p>
              </button>
            )}
            {editing ? (
              <p className="truncate text-[11px] font-medium" style={{ color: character.accentColor }}>
                Online · {character.title}
              </p>
            ) : null}
          </div>
          {!editing ? (
            <button
              type="button"
              onClick={() => {
                setDraft(tutorName);
                setEditing(true);
              }}
              aria-label="Edit tutor name"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleSpeak}
            suppressHydrationWarning
            aria-label={autoSpeak ? "Disable auto readout" : "Enable auto readout"}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
              autoSpeak ? "bg-blue-50 text-[#2f6bff]" : "text-slate-400 hover:bg-slate-100",
            )}
          >
            {autoSpeak ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
          </button>
          <button
            type="button"
            onClick={onOpenVoiceSettings}
            aria-label="Voice settings"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-[#2f6bff]"
          >
            <AudioLines className="h-5 w-5" />
          </button>
        </div>

        <div className="relative">
          <button
            type="button"
            aria-label="More options"
            suppressHydrationWarning
            onClick={onToggleMenu}
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {menuOpen ? (
            <div className="absolute right-0 top-11 w-52 overflow-hidden rounded-xl border border-slate-100 bg-white py-1 shadow-lg">
              <button
                type="button"
                suppressHydrationWarning
                onClick={onOpenCharacters}
                className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Switch tutor
              </button>
              <button
                type="button"
                suppressHydrationWarning
                onClick={onOpenSettings}
                className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Practice settings
              </button>
              <button
                type="button"
                suppressHydrationWarning
                onClick={onOpenVoiceSettings}
                className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                Voice settings
              </button>
              <button
                type="button"
                suppressHydrationWarning
                onClick={onOpenHistory}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <History className="h-4 w-4" />
                Previous chats
              </button>
              <button
                type="button"
                suppressHydrationWarning
                onClick={onClearChat}
                className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                New Chat
              </button>
              {onSignOut ? (
                <button
                  type="button"
                  suppressHydrationWarning
                  onClick={onSignOut}
                  className="block w-full px-3 py-2.5 text-left text-sm text-red-600 hover:bg-red-50"
                >
                  Sign out
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        onClick={onOpenSettings}
        aria-label={`Daily goal ${done} of ${goal} minutes`}
        className="flex w-full items-center gap-2 px-3 pb-2"
      >
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${percent}%`, backgroundColor: reached ? "#22c55e" : character.accentColor }}
          />
        </div>
        <span className="shrink-0 text-[11px] font-semibold text-slate-600">
          {done}/{goal} min {reached ? "🎉" : "🔥"}
        </span>
      </button>
    </header>
  );
}
