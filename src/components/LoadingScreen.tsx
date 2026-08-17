"use client";

import { BuddyAIMark } from "@/components/BuddyAIMark";
import { Loader2 } from "lucide-react";

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-[55] flex flex-col items-center justify-center bg-[#0a0a0c]">
      <BuddyAIMark className="mb-4 h-14 w-14 rounded-2xl" />
      <Loader2 className="mb-3 h-6 w-6 animate-spin text-[var(--accent)]" />
      <p className="text-sm font-medium text-white/45">{label}</p>
    </div>
  );
}
