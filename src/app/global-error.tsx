"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body className="flex min-h-dvh items-center justify-center bg-[#0a0a0c] px-6 text-center text-white">
        <div>
          <p className="text-sm font-medium text-white/70">BuddyAI hit a snag. Let’s try again.</p>
          <button
            type="button"
            onClick={() => reset()}
            className="mt-4 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white ring-1 ring-white/15"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
