"use client";

import { Avatar3DStage } from "@/components/Avatar3DStage";
import type { Character } from "@/lib/characters";
import { cn } from "@/lib/utils";

interface CharacterAvatarProps {
  character: Character;
  className?: string;
  online?: boolean;
  eager?: boolean;
  framed?: boolean;
  /** Show the live GLB tutor instead of the retired PNG portraits. */
  live3d?: boolean;
}

export function CharacterAvatar({
  character,
  className,
  online = false,
  framed = true,
  live3d = false,
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
        {live3d ? (
          <div className="relative h-full w-full bg-black/35">
            <div className="absolute inset-[-22%_-10%_-8%]">
              <Avatar3DStage character={character} isSpeaking={false} compact />
            </div>
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={character.portraitUrl || character.avatarUrl || `/avatars/${character.id}.png`}
            alt=""
            className="h-full w-full object-cover object-[center_18%]"
            draggable={false}
          />
        )}
      </div>
      {online ? (
        <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500 sm:h-3 sm:w-3" />
      ) : null}
    </div>
  );
}
