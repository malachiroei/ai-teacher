"use client";

import { splitBidiRuns } from "@/lib/hebrew";

export function MixedBidiText({ text, rtl = true }: { text: string; rtl?: boolean }) {
  const runs = splitBidiRuns(text);
  return (
    <span dir={rtl ? "rtl" : "ltr"} className="[unicode-bidi:isolate]">
      {runs.map((part, index) =>
        /^[A-Za-z]/.test(part) ? (
          <bdi key={`${part}-${index}`} dir="ltr">
            {part}
          </bdi>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </span>
  );
}
