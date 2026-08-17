"use client";

import { Loader2 } from "lucide-react";

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-[55] flex flex-col items-center justify-center bg-[#050805]">
      <Loader2 className="mb-3 h-8 w-8 animate-spin text-[var(--accent)]" />
      <p className="text-sm font-medium text-white/45">{label}</p>
    </div>
  );
}
