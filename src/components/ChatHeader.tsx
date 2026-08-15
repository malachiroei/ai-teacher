"use client";

import { ChevronDown, ChevronLeft, MoreVertical, Volume2, VolumeX } from "lucide-react";
import type { Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  character: Character;
  autoSpeak: boolean;
  onToggleSpeak: () => void;
  onOpenCharacters: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onClearChat: () => void;
  onSignOut?: () => void;
}

export function ChatHeader({
  character,
  autoSpeak,
  onToggleSpeak,
  onOpenCharacters,
  menuOpen,
  onToggleMenu,
  onClearChat,
  onSignOut,
}: ChatHeaderProps) {
  return (
    <header className="relative z-20 flex items-center gap-2 border-b border-slate-100 bg-white/95 px-2 py-2.5 backdrop-blur">
      <button
        type="button"
        aria-label="Back"
        suppressHydrationWarning
        className="flex h-10 w-10 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100"
      >
        <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <button
          type="button"
          onClick={onOpenCharacters}
          aria-label={`Change tutor. Current: ${character.name}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl py-0.5 pr-1 text-left transition hover:bg-slate-50"
        >
          <div className="relative shrink-0">
            <img
              src={character.avatarUrl}
              alt={character.name}
              className="h-10 w-10 rounded-full object-cover ring-2 ring-white"
              style={{ backgroundColor: `${character.accentColor}33` }}
            />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 truncate text-[15px] font-semibold leading-tight text-slate-900">
              <span className="truncate">{character.name}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            </p>
            <p className="truncate text-[11px] font-medium" style={{ color: character.accentColor }}>
              Online · {character.title}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={onToggleSpeak}
          suppressHydrationWarning
          aria-label={autoSpeak ? "Disable auto readout" : "Enable auto readout"}
          className={cn(
            "ml-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition",
            autoSpeak ? "bg-blue-50 text-[#2f6bff]" : "text-slate-400 hover:bg-slate-100",
          )}
        >
          {autoSpeak ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
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
              onClick={onClearChat}
              className="block w-full px-3 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              Clear Chat / New Topic
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
    </header>
  );
}
