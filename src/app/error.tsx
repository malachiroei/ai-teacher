"use client";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-[#050805] px-6 text-center text-white">
      <p className="text-sm font-medium text-white/70">Something went wrong. Let’s try again.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15 hover:bg-white/16"
      >
        Reload
      </button>
    </main>
  );
}
