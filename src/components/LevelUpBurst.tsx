"use client";

import { useEffect, type CSSProperties } from "react";
import type { LevelInfo } from "@/lib/progression";

interface LevelUpBurstProps {
  info: LevelInfo;
  onDone: () => void;
}

export function LevelUpBurst({ info, onDone }: LevelUpBurstProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 2800);
    return () => window.clearTimeout(timer);
  }, [info.level, onDone]);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[max(2.8rem,calc(env(safe-area-inset-top)+2.2rem))] z-[55] flex justify-center px-4">
      <div className="level-up-burst relative overflow-hidden rounded-full border border-amber-200/40 bg-slate-950/80 px-4 py-2 text-center shadow-[0_12px_40px_rgba(0,0,0,0.35)] backdrop-blur-md">
        {Array.from({ length: 8 }, (_, index) => (
          <span key={index} className="level-up-star" style={{ "--i": index } as CSSProperties}>
            ✨
          </span>
        ))}
        <p className="text-[11px] font-semibold tracking-wide text-amber-200/90">Level up</p>
        <p className="text-[13px] font-bold text-white">
          {info.emoji} Lv.{info.level} {info.title}
        </p>
      </div>
    </div>
  );
}
