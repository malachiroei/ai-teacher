"use client";

import { splitBidiRuns } from "@/lib/hebrew";

/**
 * Renders mixed Hebrew/English so Latin phrases (e.g. "Star Rocket") stay LTR
 * inside an RTL sentence and are not mirrored.
 */
export function MixedBidiText({ text, rtl = true }: { text: string; rtl?: boolean }) {
  const runs = splitBidiRuns(text);
  return (
    <span dir={rtl ? "rtl" : "ltr"} className="[unicode-bidi:plaintext]">
      {runs.map((part, index) => {
        const isLatin = /^[A-Za-z0-9]/.test(part) || /[A-Za-z]/.test(part);
        if (isLatin && /[A-Za-z]/.test(part)) {
          return (
            <bdi key={`${index}-${part.slice(0, 12)}`} dir="ltr" className="[unicode-bidi:isolate]">
              {part}
            </bdi>
          );
        }
        return (
          <span key={`${index}-${part.slice(0, 12)}`} className="[unicode-bidi:isolate]">
            {part}
          </span>
        );
      })}
    </span>
  );
}
