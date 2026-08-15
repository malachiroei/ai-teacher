"use client";

import { useState } from "react";
import type { Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface CharacterAvatarProps {
  character: Character;
  className?: string;
  online?: boolean;
  eager?: boolean;
}

export function CharacterAvatar({ character, className, online = false, eager = false }: CharacterAvatarProps) {
  const [failed, setFailed] = useState(false);

  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className="h-full w-full overflow-hidden rounded-full shadow-sm ring-2 ring-white"
        style={{
          background: `linear-gradient(145deg, ${character.accentColor}2b, ${character.accentColor}55)`,
        }}
      >
        {failed ? (
          <div
            className="flex h-full w-full items-center justify-center text-[45%] font-bold text-white"
            style={{ backgroundColor: character.accentColor }}
            aria-hidden
          >
            {character.name.charAt(0)}
          </div>
        ) : (
          <img
            src={character.avatarUrl}
            alt={character.name}
            className="h-full w-full rounded-full object-cover"
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {online ? (
        <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 sm:h-3 sm:w-3" />
      ) : null}
    </div>
  );
}
