"use client";

import { motion } from "framer-motion";
import { MixedBidiText } from "@/components/MixedBidiText";
import { Globe, Volume2 } from "lucide-react";
import type { Character } from "@/lib/characters";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/chat";

interface AIBubbleProps {
  message: Message;
  character: Character;
  showTranslation: boolean;
  onReplay: () => void;
  onToggleTranslation: () => void;
}

export function AIBubble({
  message,
  character,
  showTranslation,
  onReplay,
  onToggleTranslation,
}: AIBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex max-w-[88%] flex-col items-start gap-1.5"
    >
      <div
        className="glass-bubble rounded-[1.35rem] rounded-tl-lg px-4 py-2.5 text-[15px] leading-relaxed text-slate-800"
        style={{ boxShadow: `0 8px 28px ${character.accentColor}14` }}
      >
        {message.text}
      </div>
      <div className="flex items-center gap-1.5 pl-0.5">
        <button
          type="button"
          onClick={onReplay}
          suppressHydrationWarning
          aria-label="Replay audio"
          className="flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/50 text-slate-500 shadow-sm backdrop-blur-md transition hover:text-[var(--accent)]"
        >
          <Volume2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onToggleTranslation}
          suppressHydrationWarning
          aria-label="Show translation"
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/50 shadow-sm backdrop-blur-md transition",
            showTranslation ? "text-[var(--accent)]" : "text-slate-500 hover:text-[var(--accent)]",
          )}
        >
          <Globe className="h-3.5 w-3.5" />
        </button>
      </div>
      {showTranslation && message.translation ? (
        <p dir="rtl" className="max-w-full px-1 text-right text-[13px] leading-relaxed text-slate-500 [unicode-bidi:isolate]">
          <MixedBidiText text={message.translation} />
        </p>
      ) : null}
    </motion.div>
  );
}
