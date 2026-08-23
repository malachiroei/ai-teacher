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
          "h-full w-full overflow-hidden rounded-full bg-[#0a1210]",
          framed && "ring-2 ring-white/18 shadow-[0_0_0_1px_rgba(0,0,0,0.45)]",
        )}
        style={{
          background: `radial-gradient(circle at 50% 28%, ${character.accentColor}22 0%, #0a1210 72%)`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={character.portraitUrl || character.avatarUrl || `/avatars/${character.id}.png`}
          alt=""
          className="h-full w-full object-cover object-center"
          draggable={false}
        />
      </div>
      {online ? (
        <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 sm:h-3 sm:w-3" />
      ) : null}
    </div>
  );
}
