"use client";

import type { Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface CharacterAvatarProps {
  character: Character;
  className?: string;
  online?: boolean;
  eager?: boolean;
  framed?: boolean;
}

export function CharacterAvatar({
  character,
  className,
  online = false,
  framed = true,
}: CharacterAvatarProps) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "h-full w-full overflow-hidden rounded-full",
          framed && "shadow-sm ring-2 ring-white/80",
        )}
        style={{
          background: `linear-gradient(145deg, ${character.accentColor}2b, ${character.accentColor}55)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={character.portraitUrl || character.avatarUrl || `/avatars/${character.id}.png`}
          alt=""
          className="h-full w-full object-cover object-[center_18%]"
          draggable={false}
        />
      </div>
      {online ? (
        <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 sm:h-3 sm:w-3" />
      ) : null}
    </div>
  );
}
