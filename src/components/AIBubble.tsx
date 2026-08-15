"use client";

import { MixedBidiText } from "@/components/MixedBidiText";
import { Languages, Volume2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/chat";

interface AIBubbleProps {
  message: Message;
  showTranslation: boolean;
  onReplay: () => void;
  onToggleTranslation: () => void;
}

export function AIBubble({
  message,
  showTranslation,
  onReplay,
  onToggleTranslation,
}: AIBubbleProps) {
  return (
    <div className="msg-enter flex max-w-[86%] flex-col items-start gap-1.5">
      <div className="relative rounded-2xl rounded-tl-md bg-slate-100 px-3.5 py-2.5 text-[15px] leading-relaxed text-slate-800">
        {message.text}
      </div>
      <div className="flex items-center gap-1.5 pl-0.5">
        <button
          type="button"
          onClick={onReplay}
          suppressHydrationWarning
          aria-label="Replay audio"
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm ring-1 ring-slate-200/80 transition hover:text-[#2f6bff]"
        >
          <Volume2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleTranslation}
          suppressHydrationWarning
          aria-label="Show translation"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-slate-200/80 transition",
            showTranslation ? "text-[#2f6bff]" : "text-slate-500 hover:text-[#2f6bff]",
          )}
        >
          <Languages className="h-3.5 w-3.5" />
        </button>
      </div>
      {showTranslation && message.translation ? (
        <p dir="rtl" className="max-w-full px-1 text-right text-[13px] leading-relaxed text-slate-500 [unicode-bidi:isolate]">
          <MixedBidiText text={message.translation} />
        </p>
      ) : null}
    </div>
  );
}
