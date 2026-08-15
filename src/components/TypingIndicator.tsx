import { CharacterAvatar } from "@/components/CharacterAvatar";
import type { Character } from "@/lib/characters";

export function TypingIndicator({ character }: { character?: Character }) {
  return (
    <div className="msg-enter flex max-w-[90%] items-end gap-2">
      {character ? <CharacterAvatar character={character} className="h-8 w-8" /> : null}
      <div className="flex items-center gap-1 rounded-2xl rounded-tl-md bg-slate-100 px-4 py-3">
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-slate-400" />
      </div>
    </div>
  );
}
