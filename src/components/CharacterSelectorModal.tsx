"use client";

import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { CharacterAvatar } from "@/components/CharacterAvatar";
import { CHARACTERS, type Character, type CharacterId } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface CharacterSelectorModalProps {
  selectedId: CharacterId | string;
  nicknames?: Record<string, string>;
  onSelect: (characterId: CharacterId) => void;
  onClose: () => void;
}

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
        className="absolute inset-0 bg-black/55"
        aria-label="Close character picker"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", damping: 28, stiffness: 340 }}
        className="relative flex max-h-[92%] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#0c1410]/95 shadow-2xl backdrop-blur-xl"
      >
        <div className="flex items-center justify-between px-4 py-3.5">
          <div>
            <h2 className="text-[16px] font-semibold tracking-tight text-white">Choose your tutor</h2>
            <p className="mt-0.5 text-[12px] text-white/50">Pick a BuddyAI companion to talk with</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 overflow-y-auto px-3 pb-5 md:grid-cols-3 sm:gap-3.5 sm:px-4">
          {CHARACTERS.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              displayName={nicknames?.[character.id]?.trim() || character.name}
              selected={character.id === selectedId}
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
  onSelect,
}: {
  character: Character;
  displayName: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex min-h-[210px] flex-col items-center overflow-visible rounded-2xl border px-3 py-4 text-center transition",
        selected ? "border-transparent bg-white/8" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]",
      )}
      style={selected ? { boxShadow: `inset 0 0 0 2px ${character.accentColor}` } : undefined}
    >
      {selected ? (
        <span
          className="absolute top-2.5 right-2.5 flex h-5 w-5 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: character.accentColor }}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      ) : null}
      <CharacterAvatar character={character} className="h-24 w-24 shrink-0" eager />
      <p className="mt-3 w-full text-[15px] font-semibold leading-snug tracking-tight text-white">
        {displayName}
      </p>
      <span
        className="mt-2 inline-flex max-w-full rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase"
        style={{ backgroundColor: `${character.accentColor}22`, color: character.accentColor }}
      >
        {character.tag}
      </span>
      <p className="mt-2.5 w-full text-[12px] leading-relaxed text-white/60">
        {character.shortDescription}
      </p>
    </button>
  );
}
