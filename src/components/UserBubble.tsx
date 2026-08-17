"use client";

import { motion } from "framer-motion";
import { MixedBidiText } from "@/components/MixedBidiText";
import { hasHebrewScript } from "@/lib/language";
import type { Message } from "@/types/chat";

interface UserBubbleProps {
  message: Message;
}

export function UserBubble({ message }: UserBubbleProps) {
  const feedback = message.grammarFeedback;
  const hasError = Boolean(feedback?.hasError);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="flex max-w-[86%] min-w-0 flex-col items-end self-end"
    >
      <div className="w-full overflow-hidden rounded-[1.35rem] rounded-tr-lg bg-slate-900/92 px-4 py-2.5 text-left text-[15px] leading-relaxed text-white shadow-[0_10px_28px_rgba(15,23,42,0.16)] backdrop-blur-xl">
        <p
          dir="auto"
          className={
            hasError
              ? "break-words text-white/80 line-through decoration-white/70 decoration-2"
              : "break-words"
          }
        >
          {message.text}
        </p>

        {hasError && feedback ? (
          <div className="mt-2.5 space-y-2 border-t border-white/20 pt-2.5">
            <p dir="rtl" className="text-[11px] font-semibold tracking-wide text-white/85">
              תיקון דקדוק:
            </p>
            <p
              dir="auto"
              className="break-words rounded-xl border border-emerald-200/80 bg-emerald-50 px-2.5 py-2 text-[14px] font-medium leading-relaxed text-emerald-800"
            >
              {feedback.correctedText}
            </p>
            {feedback.explanation ? (
              <p
                dir={hasHebrewScript(feedback.explanation) ? "rtl" : "auto"}
                className="break-words text-[13px] leading-relaxed text-white/90 [unicode-bidi:isolate]"
              >
                <MixedBidiText
                  text={feedback.explanation}
                  rtl={hasHebrewScript(feedback.explanation)}
                />
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}
