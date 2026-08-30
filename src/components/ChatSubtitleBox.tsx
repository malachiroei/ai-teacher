"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Globe, Lightbulb, Volume2 } from "lucide-react";
import { MixedBidiText } from "@/components/MixedBidiText";

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
    <div className="mb-3 flex min-h-[auto] w-full flex-col items-center justify-end pb-2">
      <AnimatePresence mode="wait">
        {thinking && !tutor ? (
          <motion.p
            key="think"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="max-w-[22rem] text-center text-[15px] font-medium text-white"
          >
            {tutorName} is thinking...
          </motion.p>
        ) : showIdle && onIdleHintTap ? (
          <motion.button
            key="idle"
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="max-w-[22rem] text-center text-[15px] font-medium text-white"
            onClick={onIdleHintTap}
          >
            {idleHint.includes("💡") ? idleHint : idleHint}
          </motion.button>
        ) : showIdle ? (
          <motion.p
            key="idle-text"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="max-w-[22rem] text-center text-[15px] font-medium text-white"
          >
            {idleHint}
          </motion.p>
        ) : (
          <motion.div
            key={`${tutor}:${child}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22 }}
            className="flex w-full max-w-[22rem] flex-col items-center gap-1.5 overflow-visible pb-2 text-center"
          >
            {child ? (
              <p dir="ltr" className="text-[13px] font-medium leading-relaxed text-white/70">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200/80">
                  {listening ? "You" : childName}
                </span>
                {child}
              </p>
            ) : null}
            {tutor ? (
              <>
                <p dir="ltr" className="text-[15px] font-medium leading-relaxed text-white">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
                    {tutorName}
                  </span>
                  {tutor}
                </p>
                <div className="flex items-center justify-center gap-2 pt-0.5">
                  {onReplayTutor ? (
                    <button
                      type="button"
                      onClick={onReplayTutor}
                      aria-label="Play audio again"
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white/90 backdrop-blur-md transition hover:bg-white/16"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {hebrew ? (
                    <button
                      type="button"
                      onClick={() => setShowHebrew((value) => !value)}
                      aria-label="Toggle Hebrew translation"
                      className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md transition hover:bg-white/16 ${
                        showHebrew ? "text-amber-200" : "text-white/80"
                      }`}
                    >
                      <Globe className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                  {idleHint.includes("hint") || idleHint.includes("💡") ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/30 bg-amber-400/10 px-2 py-1 text-[11px] text-amber-100">
                      <Lightbulb className="h-3 w-3" /> Hint
                    </span>
                  ) : null}
                </div>
                {showHebrew && hebrew ? (
                  <p
                    dir="rtl"
                    className="min-h-[auto] max-h-none overflow-visible px-1 pb-2 text-sm leading-relaxed text-gray-300 [unicode-bidi:isolate]"
                  >
                    <MixedBidiText text={hebrew} />
                  </p>
                ) : null}
              </>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
