"use client";

import { motion } from "framer-motion";
import { Check, Sparkles, X } from "lucide-react";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import { CHARACTERS, type Character, type CharacterId } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface CharacterSelectorModalProps {
  selectedId: CharacterId | string;
  nicknames?: Record<string, string>;
  onSelect: (characterId: CharacterId) => void;
  onClose: () => void;
}

const CARD_THEMES: Record<string, { gradient: string; glow: string; emoji: string }> = {
  emma: { gradient: "from-violet-400 via-fuchsia-400 to-indigo-500", glow: "rgba(139,124,255,0.45)", emoji: "🤖" },
  alex: { gradient: "from-orange-400 via-amber-400 to-rose-500", glow: "rgba(255,154,31,0.45)", emoji: "⚡" },
  leo: { gradient: "from-sky-400 via-blue-500 to-indigo-600", glow: "rgba(61,155,255,0.45)", emoji: "🚀" },
  maya: { gradient: "from-pink-400 via-rose-400 to-fuchsia-500", glow: "rgba(255,93,162,0.45)", emoji: "🎨" },
  kai: { gradient: "from-emerald-400 via-green-500 to-teal-600", glow: "rgba(34,197,94,0.45)", emoji: "🦊" },
  chloe: { gradient: "from-purple-400 via-violet-500 to-fuchsia-600", glow: "rgba(168,85,247,0.45)", emoji: "👾" },
};

export function CharacterSelectorModal({ selectedId, nicknames, onSelect, onClose }: CharacterSelectorModalProps) {
  function handleSelect(characterId: CharacterId) {
    try {
      onSelect(characterId);
    } catch (error) {
      console.error("Character select error:", error);
    }
  }

  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center p-3 sm:items-center">
      <motion.button
        type="button"
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        aria-label="Close character picker"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        className="glass-panel relative flex max-h-[92%] w-full max-w-3xl flex-col overflow-hidden shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <h2 className="text-[17px] font-black tracking-tight text-slate-800">Pick your AI buddy</h2>
            <p className="mt-0.5 text-[12px] font-medium text-slate-500">בחר/י מורה — Pixar heroes & cyber friends</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-slate-600 shadow-sm hover:bg-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 overflow-y-auto px-3 pb-5 md:grid-cols-3 sm:gap-3.5 sm:px-4">
          {CHARACTERS.map((character, index) => (
            <CharacterCard
              key={character.id}
              character={character}
              displayName={nicknames?.[character.id]?.trim() || character.name}
              selected={character.id === selectedId}
              index={index}
              onSelect={() => handleSelect(character.id)}
            />
          ))}
        </div>
      </motion.div>
    </div>
  );
}

function CharacterCard({
  character,
  displayName,
  selected,
  index,
  onSelect,
}: {
  character: Character;
  displayName: string;
  selected: boolean;
  index: number;
  onSelect: () => void;
}) {
  const theme = CARD_THEMES[character.id] ?? CARD_THEMES.emma;

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className={cn(
        "relative flex min-h-[220px] flex-col items-center overflow-hidden rounded-3xl border-2 px-3 py-4 text-center transition",
        selected ? "border-white bg-white shadow-xl" : "border-white/60 bg-white/75 shadow-md hover:shadow-lg",
      )}
      style={selected ? { boxShadow: `0 12px 40px ${theme.glow}` } : undefined}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-br opacity-90",
          theme.gradient,
        )}
      />
      <span className="pointer-events-none absolute top-3 right-3 text-lg opacity-80">{theme.emoji}</span>
      {selected ? (
        <span className="absolute top-3 left-3 flex h-6 w-6 items-center justify-center rounded-full bg-white text-violet-600 shadow-md">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : null}
      <div className="relative z-10 mt-6 rounded-full bg-white/90 p-1 shadow-lg ring-4 ring-white/80">
        <CharacterAvatar character={character} className="h-20 w-20 shrink-0" eager />
      </div>
      <p className="relative z-10 mt-3 w-full text-[15px] font-black leading-snug text-slate-800">{displayName}</p>
      <span
        className={cn(
          "relative z-10 mt-2 inline-flex max-w-full rounded-full bg-gradient-to-r px-2.5 py-0.5 text-[10px] font-bold tracking-[0.12em] text-white uppercase",
          theme.gradient,
        )}
      >
        {character.tag}
      </span>
      <p className="relative z-10 mt-2.5 w-full text-[11px] leading-relaxed text-slate-600">{character.shortDescription}</p>
      {selected ? (
        <span className="relative z-10 mt-2 inline-flex items-center gap-1 text-[10px] font-semibold text-violet-600">
          <Sparkles className="h-3 w-3" /> Active buddy
        </span>
      ) : null}
    </motion.button>
  );
}
