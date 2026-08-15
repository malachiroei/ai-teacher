"use client";

import { Loader2 } from "lucide-react";

export function LoadingScreen({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-white">
      <Loader2 className="mb-3 h-8 w-8 animate-spin text-[#2f6bff]" />
      <p className="text-sm font-medium text-slate-500">{label}</p>
    </div>
  );
}
