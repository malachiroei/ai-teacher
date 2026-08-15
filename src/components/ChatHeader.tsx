"use client";

import { ChevronLeft, MoreVertical, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatHeaderProps {
  autoSpeak: boolean;
  onToggleSpeak: () => void;
  menuOpen: boolean;
  onToggleMenu: () => void;
  onClearChat: () => void;
  onSignOut?: () => void;
}

export function ChatHeader({
  autoSpeak,
  onToggleSpeak,
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
        <div className="relative shrink-0">
          <img
            src="https://api.dicebear.com/9.x/adventurer/svg?seed=Emma&backgroundColor=c0aede"
            alt="Emma"
            className="h-10 w-10 rounded-full bg-violet-100 object-cover ring-2 ring-white"
          />
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold leading-tight text-slate-900">Emma</p>
          <p className="text-[11px] font-medium text-emerald-600">Online · English tutor</p>
        </div>
        <button
          type="button"
          onClick={onToggleSpeak}
          suppressHydrationWarning
          aria-label={autoSpeak ? "Disable auto readout" : "Enable auto readout"}
          className={cn(
            "ml-0.5 flex h-9 w-9 items-center justify-center rounded-full transition",
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
