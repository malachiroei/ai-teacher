"use client";

import { Lightbulb, Shuffle } from "lucide-react";

interface QuickActionsProps {
  onAnotherQuestion: () => void;
  onSuggestAnswer: () => void;
  disabled?: boolean;
}

export function QuickActions({ onAnotherQuestion, onSuggestAnswer, disabled }: QuickActionsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto px-3 pb-2 pt-1">
      <button
        type="button"
        disabled={disabled}
        suppressHydrationWarning
        onClick={onAnotherQuestion}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-[#2f6bff] disabled:opacity-50"
      >
        <Shuffle className="h-3.5 w-3.5" />
        Another question
      </button>
      <button
        type="button"
        disabled={disabled}
        suppressHydrationWarning
        onClick={onSuggestAnswer}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[13px] font-medium text-slate-700 shadow-sm transition hover:border-blue-200 hover:text-[#2f6bff] disabled:opacity-50"
      >
        <Lightbulb className="h-3.5 w-3.5" />
        Suggest answer
      </button>
    </div>
  );
}
