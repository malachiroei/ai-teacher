"use client";

import { ArrowUp, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isRecording: boolean;
  onToggleMic: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  isRecording,
  onToggleMic,
  disabled,
  placeholder = "Message…",
}: InputBarProps) {
  const canSend = Boolean(value.trim()) && !disabled;

  return (
    <form
      className="shrink-0 px-3 pb-[max(0.7rem,env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 p-1.5 pl-4 shadow-[0_10px_40px_rgba(15,23,42,0.1)] backdrop-blur-2xl">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label="Message"
          disabled={disabled}
          suppressHydrationWarning
          className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-800 outline-none placeholder:font-normal placeholder:text-slate-400 disabled:opacity-60"
          dir="auto"
        />
        <button
          type="button"
          onClick={onToggleMic}
          suppressHydrationWarning
          disabled={disabled && !isRecording}
          aria-label={isRecording ? "Stop recording" : "Start voice input"}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95",
            isRecording
              ? "mic-recording bg-red-500 text-white"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800",
          )}
        >
          <Mic className="h-5 w-5" />
        </button>
        <button
          type="submit"
          disabled={!canSend}
          suppressHydrationWarning
          aria-label="Send message"
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white transition active:scale-95",
            canSend ? "bg-slate-900 shadow-md hover:bg-slate-800" : "bg-slate-200 text-slate-400",
          )}
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2.4} />
        </button>
      </div>
    </form>
  );
}
