"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Lightbulb, Volume2 } from "lucide-react";
import { MixedBidiText } from "@/components/MixedBidiText";
import { cn } from "@/lib/utils";

interface ChatSubtitleBoxProps {
  tutorName: string;
  childName: string;
  tutorLine?: string;
  tutorHebrew?: string;
  childLine?: string;
  listening?: boolean;
  thinking?: boolean;
  idleHint?: string;
  onIdleHintTap?: () => void;
  onReplayTutor?: () => void;
  showTranslationDefault?: boolean;
}

export function ChatSubtitleBox({
  tutorName,
  childName,
  tutorLine = "",
  tutorHebrew = "",
  childLine = "",
  listening = false,
  thinking = false,
  idleHint = "",
  onIdleHintTap,
  onReplayTutor,
  showTranslationDefault = true,
}: ChatSubtitleBoxProps) {
  const child = childLine.trim();
  const tutor = tutorLine.trim();
  const hebrew = tutorHebrew.trim();
  const [showHebrew, setShowHebrew] = useState(showTranslationDefault);
  const showIdle = Boolean(idleHint) && !child && !tutor && !thinking;

  return (
    <div className="relative flex w-full flex-col items-center">
      <AnimatePresence mode="wait">
        {thinking && !tutor ? (
          <motion.p
            key="think"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel w-full max-w-md px-4 py-2.5 text-center text-base font-semibold text-slate-700"
          >
            {tutorName} is thinking...
          </motion.p>
        ) : showIdle && onIdleHintTap ? (
          <motion.button
            key="idle"
            type="button"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel w-full max-w-md px-4 py-2.5 text-center text-base font-semibold text-slate-700"
            onClick={onIdleHintTap}
          >
            {idleHint}
          </motion.button>
        ) : showIdle ? (
          <motion.p
            key="idle-text"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glass-panel w-full max-w-md px-4 py-2.5 text-center text-base font-semibold text-slate-700"
          >
            {idleHint}
          </motion.p>
        ) : (
          <motion.div
            key={`${tutor}:${child}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="flex w-full max-w-md flex-col gap-2"
          >
            {child ? (
              <div dir="ltr" className="glass-panel ml-auto max-w-[92%] px-4 py-2.5 text-left">
                <p className="text-[10px] font-bold uppercase tracking-wide text-cyan-600">
                  {listening ? "You" : childName}
                </p>
                <p className="mt-0.5 text-base font-medium leading-snug text-slate-800">{child}</p>
              </div>
            ) : null}
            {tutor ? (
              <div className="glass-panel w-full px-4 py-2.5 text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-violet-600">{tutorName}</p>
                    <p dir="ltr" className="mt-0.5 line-clamp-3 text-base font-semibold leading-snug text-slate-900">
                      {tutor}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {onReplayTutor ? (
                      <button
                        type="button"
                        onClick={onReplayTutor}
                        aria-label="Play audio again"
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-violet-200 bg-white text-violet-700 shadow-sm transition hover:bg-violet-50"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    ) : null}
                    {hebrew ? (
                      <button
                        type="button"
                        onClick={() => setShowHebrew((value) => !value)}
                        aria-label="Toggle Hebrew translation"
                        className={cn(
                          "flex h-9 w-9 items-center justify-center rounded-full border bg-white shadow-sm transition hover:bg-violet-50",
                          showHebrew ? "border-amber-300 text-amber-600" : "border-violet-200 text-violet-700",
                        )}
                      >
                        <Globe className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                {idleHint.includes("hint") || idleHint.includes("💡") ? (
                  <span className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                    <Lightbulb className="h-3 w-3" /> Hint
                  </span>
                ) : null}
                {showHebrew && hebrew ? (
                  <p
                    dir="rtl"
                    lang="he"
                    className="mt-1.5 line-clamp-3 border-t border-slate-200/80 pt-1.5 text-right text-sm leading-snug text-slate-600 [unicode-bidi:plaintext]"
                  >
                    <MixedBidiText text={hebrew} rtl />
                  </p>
                ) : null}
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
