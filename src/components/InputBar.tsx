"use client";

import { Mic, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isRecording: boolean;
  onToggleMic: () => void;
  disabled?: boolean;
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  isRecording,
  onToggleMic,
  disabled,
}: InputBarProps) {
  return (
    <form
    className="flex shrink-0 items-center gap-2 border-t border-slate-100 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex min-w-0 flex-1 items-center rounded-full bg-slate-100 px-4 py-2.5">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Aa"
          aria-label="Message"
          disabled={disabled}
          suppressHydrationWarning
          className="w-full bg-transparent text-[15px] text-slate-800 outline-none placeholder:text-slate-400 disabled:opacity-60"
          dir="auto"
        />
        {value.trim() ? (
          <button
            type="submit"
            disabled={disabled}
            suppressHydrationWarning
            aria-label="Send message"
            className="ml-1 text-[#2f6bff] disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={onToggleMic}
        suppressHydrationWarning
        disabled={disabled && !isRecording}
        aria-label={isRecording ? "Stop recording" : "Start voice input"}
        className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white shadow-lg transition active:scale-95",
          isRecording ? "mic-recording bg-red-500 shadow-red-200" : "bg-[#2f6bff] shadow-blue-200 hover:bg-[#1e54e0]",
        )}
      >
        <Mic className="h-6 w-6" />
      </button>
    </form>
  );
}
