"use client";

import { Check, X } from "lucide-react";
import { CHARACTERS, type Character, type CharacterId } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface CharacterSelectorModalProps {
  selectedId: CharacterId | string;
  onSelect: (characterId: CharacterId) => void;
  onClose: () => void;
}

export function CharacterSelectorModal({ selectedId, onSelect, onClose }: CharacterSelectorModalProps) {
  return (
    <div className="absolute inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-3 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close character picker" onClick={onClose} />
      <div className="relative flex max-h-[85%] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
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

        <div className="grid gap-2.5 overflow-y-auto px-4 pb-5">
          {CHARACTERS.map((character) => (
            <CharacterCard
              key={character.id}
              character={character}
              selected={character.id === selectedId}
              onSelect={() => onSelect(character.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CharacterCard({
  character,
  selected,
  onSelect,
}: {
  character: Character;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-2xl border px-3 py-3 text-left transition",
        selected ? "border-transparent bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:bg-slate-50",
      )}
      style={selected ? { boxShadow: `inset 0 0 0 2px ${character.accentColor}` } : undefined}
    >
      <img
        src={character.avatarUrl}
        alt={character.name}
        className="h-12 w-12 shrink-0 rounded-full object-cover"
        style={{ backgroundColor: `${character.accentColor}22` }}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[15px] font-semibold text-slate-900">{character.name}</p>
          <span
            className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ backgroundColor: `${character.accentColor}18`, color: character.accentColor }}
          >
            {character.title}
          </span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-slate-500">{character.shortDescription}</p>
      </div>
      {selected ? (
        <span
          className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white"
          style={{ backgroundColor: character.accentColor }}
        >
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      ) : null}
    </button>
  );
}
