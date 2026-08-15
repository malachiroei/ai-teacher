"use client";

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
    <div className="absolute inset-0 z-[60] flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close character picker" onClick={onClose} />
      <div className="relative flex max-h-[90%] w-full max-w-md flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Choose your tutor</h2>
            <p className="text-xs text-slate-500">Pick a character to practice English with</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 overflow-y-auto px-3 pb-4 sm:gap-2.5 sm:px-4 sm:pb-5">
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
      </div>
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
        "relative flex min-h-[148px] flex-col items-center rounded-2xl border px-2.5 py-3 text-center transition sm:min-h-[160px] sm:px-3",
        selected ? "border-transparent bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50",
      )}
      style={selected ? { boxShadow: `inset 0 0 0 2px ${character.accentColor}` } : undefined}
    >
      {selected ? (
        <span
          className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: character.accentColor }}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      ) : null}
      <CharacterAvatar character={character} className="h-14 w-14 sm:h-16 sm:w-16" />
      <p className="mt-2 w-full truncate text-[13px] font-semibold leading-tight text-slate-900 sm:text-[14px]">
        {displayName}
      </p>
      <span
        className="mt-1 max-w-full truncate rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide sm:text-[10px]"
        style={{ backgroundColor: `${character.accentColor}18`, color: character.accentColor }}
      >
        {character.tag}
      </span>
      <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-slate-500 sm:text-[12px]">
        {character.shortDescription}
      </p>
    </button>
  );
}
