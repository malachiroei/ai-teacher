"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import type { Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface HeroStageProps {
  character: Character;
  tutorName: string;
  thinking?: boolean;
  speaking?: boolean;
  listening?: boolean;
  compact?: boolean;
  onOpenCharacters: () => void;
  onSaveTutorName: (name: string) => void;
}

export function HeroStage({
  character,
  tutorName,
  thinking = false,
  speaking = false,
  listening = false,
  compact = false,
  onOpenCharacters,
  onSaveTutorName,
}: HeroStageProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(tutorName);
  const live = thinking || speaking || listening;
  const size = compact ? 96 : 112;

  useEffect(() => {
    if (!editing) setDraft(tutorName);
  }, [editing, tutorName]);

  function commitName() {
    const next = draft.trim() || character.name;
    setEditing(false);
    if (next !== tutorName) onSaveTutorName(next);
  }

  const status = thinking
    ? "Thinking…"
    : speaking
      ? "Speaking…"
      : listening
        ? "Listening…"
        : `Online · ${character.title}`;

  return (
    <section className="relative z-10 flex shrink-0 flex-col items-center px-4 pt-[calc(3.25rem+env(safe-area-inset-top))] pb-2">
      <motion.button
        type="button"
        onClick={onOpenCharacters}
        aria-label={`Change tutor. Current: ${tutorName}`}
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
        whileTap={{ scale: 0.97 }}
      >
        <span
          className={cn("hero-aura pointer-events-none absolute inset-[-22%] rounded-full", live && "hero-aura-live")}
          style={{
            background: `radial-gradient(circle, ${character.accentColor}66 0%, ${character.accentColor}00 68%)`,
          }}
          aria-hidden
        />
        <span
          className={cn("hero-ring pointer-events-none absolute inset-[-10px] rounded-full", live && "hero-ring-live")}
          style={{ borderColor: character.accentColor }}
          aria-hidden
        />
        {thinking ? (
          <motion.span
            className="pointer-events-none absolute inset-[-12px] rounded-full"
            style={{
              background: `conic-gradient(from 0deg, transparent 0%, ${character.accentColor} 40%, transparent 68%)`,
              maskImage: "radial-gradient(circle, transparent 64%, black 66%)",
              WebkitMaskImage: "radial-gradient(circle, transparent 64%, black 66%)",
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
            aria-hidden
          />
        ) : null}
        <div
          className={cn(
            "hero-breathe relative overflow-hidden rounded-full bg-white shadow-[0_16px_40px_rgba(15,23,42,0.16)] ring-[3px] ring-white",
            speaking && "hero-breathe-talk",
          )}
          style={{ width: size, height: size }}
        >
          <CharacterAvatar character={character} className="h-full w-full" eager framed={false} live3d />
        </div>
      </motion.button>

      <div className="mt-3 w-full max-w-[260px] text-center">
        {editing ? (
          <form
            className="flex items-center justify-center"
            onSubmit={(event) => {
              event.preventDefault();
              commitName();
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onBlur={commitName}
              autoFocus
              maxLength={24}
              aria-label="Tutor nickname"
              className="w-full rounded-full border border-white/80 bg-white/80 px-3 py-1 text-center text-[16px] font-semibold text-slate-900 outline-none backdrop-blur-md"
            />
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(tutorName);
              setEditing(true);
            }}
            className="mx-auto block max-w-full truncate text-[17px] font-semibold tracking-tight text-slate-900"
          >
            {tutorName}
          </button>
        )}
        <p
          className="mt-0.5 truncate text-[12px] font-medium text-slate-500"
          style={{ color: live ? character.accentColor : undefined }}
        >
          {status}
        </p>
      </div>
    </section>
  );
}
