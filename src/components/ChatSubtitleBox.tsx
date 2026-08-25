"use client";

import { AnimatePresence, motion } from "framer-motion";
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
}: ChatSubtitleBoxProps) {
  const child = childLine.trim();
  const tutor = tutorLine.trim();
  const hebrew = tutorHebrew.trim();
  const showIdle = Boolean(idleHint) && !child && !tutor && !thinking;

  return (
    <div className="mb-3 flex min-h-[3.25rem] w-full flex-col items-center justify-end">
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
            {idleHint}
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
            className="flex w-full max-w-[22rem] flex-col items-center gap-1.5 text-center"
          >
            {child ? (
              <p dir="ltr" className="text-[13px] font-medium leading-snug text-white/70">
                <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-cyan-200/80">
                  {listening ? "You" : childName}
                </span>
                {child}
              </p>
            ) : null}
            {tutor ? (
              <>
                <p dir="ltr" className="text-[15px] font-medium leading-snug text-white">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/80">
                    {tutorName}
                  </span>
                  {tutor}
                </p>
                {hebrew ? (
                  <p dir="rtl" className="max-h-12 overflow-hidden px-1 text-sm leading-snug text-gray-300">
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
