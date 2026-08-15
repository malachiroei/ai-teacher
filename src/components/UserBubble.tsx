"use client";

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
    <div className="msg-enter flex max-w-[86%] min-w-0 flex-col items-end self-end">
      <div className="w-full overflow-hidden rounded-2xl rounded-tr-md bg-[#2f6bff] px-3.5 py-2.5 text-left text-[15px] leading-relaxed text-white shadow-sm">
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
          <div className="mt-2.5 space-y-2 border-t border-white/25 pt-2.5">
            <p dir="rtl" className="text-[11px] font-semibold tracking-wide text-white/85">
              תיקון דקדוק:
            </p>
            <p
              dir="auto"
              className="break-words rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[14px] font-medium leading-relaxed text-emerald-800"
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
    </div>
  );
}
