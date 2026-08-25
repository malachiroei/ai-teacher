"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  GAME_XP_REWARD,
  isCorrectGameChoice,
  type ChatGame,
  type FillMissingData,
  type ListenPickData,
  type PictureMatchData,
} from "@/lib/chat-games";
import { cn } from "@/lib/utils";

interface ChatGameCardProps {
  game: ChatGame;
  onSpeakPrompt?: (text: string) => void;
  onComplete: (choice: string, correct: boolean) => void;
  onClose: () => void;
}

export function ChatGameCard({ game, onSpeakPrompt, onComplete, onClose }: ChatGameCardProps) {
  const [picked, setPicked] = useState("");
  const [wrong, setWrong] = useState(false);
  const [won, setWon] = useState(false);

  useEffect(() => {
    if (game.type === "listen_pick") {
      const data = game.data as ListenPickData;
      onSpeakPrompt?.(data.speak);
    }
  }, [game, onSpeakPrompt]);

  function choose(choice: string) {
    if (won) return;
    if (isCorrectGameChoice(game, choice)) {
      setPicked(choice);
      setWon(true);
      window.setTimeout(() => onComplete(choice, true), 700);
      return;
    }
    setPicked(choice);
    setWrong(true);
    window.setTimeout(() => setWrong(false), 420);
  }

  const options =
    game.type === "listen_pick"
      ? (game.data as ListenPickData).options.map((item) => item.label)
      : game.type === "fill_missing"
        ? (game.data as FillMissingData).options
        : (game.data as PictureMatchData).options;

  return (
    <div className="absolute inset-x-3 bottom-[7.5rem] z-40 flex justify-center">
      <motion.div
        initial={{ y: 18, opacity: 0, scale: 0.96 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className={cn(
          "relative w-full max-w-sm overflow-hidden rounded-3xl border border-amber-300/25 bg-[#10160f]/95 p-4 shadow-[0_0_28px_rgba(251,191,36,0.18)] backdrop-blur-xl",
          wrong && "animate-pulse",
        )}
      >
        {won ? <ConfettiBurst /> : null}
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[11px] font-semibold tracking-wide text-amber-200 uppercase">Quick Game · +{GAME_XP_REWARD} XP</p>
          <button type="button" onClick={onClose} className="text-[11px] text-white/40">
            Skip
          </button>
        </div>
        <GameBody game={game} />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {options.map((option) => {
            const visual =
              game.type === "listen_pick"
                ? (game.data as ListenPickData).options.find((item) => item.label === option)
                : null;
            return (
              <button
                key={option}
                type="button"
                onClick={() => choose(option)}
                className={cn(
                  "rounded-2xl border px-3 py-2.5 text-[14px] font-semibold transition",
                  won && isCorrectGameChoice(game, option)
                    ? "border-emerald-300 bg-emerald-400/20 text-emerald-100"
                    : picked === option && wrong
                      ? "border-rose-400 bg-rose-500/20 text-rose-100"
                      : "border-white/12 bg-white/8 text-white hover:bg-white/14",
                )}
              >
                {visual ? `${visual.emoji} ${option}` : option}
              </button>
            );
          })}
        </div>
        {game.type === "listen_pick" ? (
          <button
            type="button"
            onClick={() => onSpeakPrompt?.((game.data as ListenPickData).speak)}
            className="mt-3 w-full text-center text-[12px] font-semibold text-amber-100/80"
          >
            🔊 Hear it again
          </button>
        ) : null}
      </motion.div>
    </div>
  );
}

function GameBody({ game }: { game: ChatGame }) {
  if (game.type === "fill_missing") {
    const data = game.data as FillMissingData;
    return (
      <div className="text-center">
        <p className="text-4xl">{data.emoji}</p>
        <p className="mt-2 text-[13px] text-white/70">{data.prompt}</p>
        <p className="mt-1 font-mono text-2xl tracking-[0.2em] text-amber-100">{data.pattern}</p>
      </div>
    );
  }
  if (game.type === "listen_pick") {
    const data = game.data as ListenPickData;
    return (
      <div className="text-center">
        <p className="text-3xl">🎧</p>
        <p className="mt-2 text-[14px] text-white/80">{data.prompt}</p>
      </div>
    );
  }
  const data = game.data as PictureMatchData;
  return (
    <div className="text-center">
      <p className="text-5xl">{data.emoji}</p>
      <p className="mt-2 text-[14px] text-white/80">{data.prompt}</p>
    </div>
  );
}

function ConfettiBurst() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {["🌟", "🎉", "✨", "🏆", "🎊"].map((item, index) => (
        <motion.span
          key={item}
          className="absolute text-lg"
          initial={{ y: 40, x: 40 + index * 48, opacity: 1 }}
          animate={{ y: -20, opacity: 0 }}
          transition={{ duration: 0.7, delay: index * 0.04 }}
        >
          {item}
        </motion.span>
      ))}
    </div>
  );
}
