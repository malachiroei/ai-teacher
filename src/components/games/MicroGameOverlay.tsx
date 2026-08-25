"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  GAME_ROUND_LENGTH,
  GAME_ROUND_XP,
  GAME_XP_REWARD,
  fillPatternParts,
  isCorrectGameChoice,
  transcriptMatchesChoice,
  type ChatGame,
  type FillMissingData,
  type ListenPickData,
  type PictureMatchData,
} from "@/lib/chat-games";
import { playGameSfx, playTryAgainSound } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

const BALLOON_SKINS = [
  "from-cyan-300 via-sky-500 to-blue-700",
  "from-fuchsia-300 via-purple-500 to-violet-800",
  "from-amber-200 via-orange-400 to-amber-700",
  "from-emerald-300 via-green-500 to-teal-800",
];

interface MicroGameOverlayProps {
  games: ChatGame[];
  liveTranscript?: string;
  listening?: boolean;
  audioLevel?: number;
  onRequestListen?: () => void;
  onSpeakPrompt?: (text: string) => void;
  onQuestionCorrect?: (choice: string, index: number) => void;
  onRoundComplete: (answers: string[]) => void;
  onClose: () => void;
}

export function MicroGameOverlay(props: MicroGameOverlayProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(<ArcadeStage {...props} />, document.body);
}

export const ChatGameCard = MicroGameOverlay;

function ArcadeStage({
  games,
  liveTranscript = "",
  listening = false,
  audioLevel = 0,
  onRequestListen,
  onSpeakPrompt,
  onQuestionCorrect,
  onRoundComplete,
  onClose,
}: MicroGameOverlayProps) {
  const [index, setIndex] = useState(0);
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const [won, setWon] = useState(false);
  const [popped, setPopped] = useState("");
  const [summary, setSummary] = useState(false);
  const [answers, setAnswers] = useState<string[]>([]);
  const heardRef = useRef("");

  const game = games[Math.min(index, Math.max(0, games.length - 1))];
  const total = Math.max(1, games.length);
  const stage = Math.min(index + 1, total);

  useEffect(() => {
    setIndex(0);
    setWrongPicks([]);
    setShaking(false);
    setWon(false);
    setPopped("");
    setSummary(false);
    setAnswers([]);
    heardRef.current = "";
  }, [games]);

  useEffect(() => {
    if (!game || won || summary) return;
    heardRef.current = "";
    const line =
      game.type === "picture_match"
        ? `Pop the word: ${game.data.answer}!`
        : game.type === "listen_pick"
          ? `Say it out loud to unlock the treasure! ${(game.data as ListenPickData).speak}`
          : `Tap the missing letter!`;
    onSpeakPrompt?.(line);
  }, [game, onSpeakPrompt, won, summary]);

  useEffect(() => {
    if (!game || won || summary || !liveTranscript.trim()) return;
    if (liveTranscript === heardRef.current) return;
    heardRef.current = liveTranscript;
    const hit = gameOptions(game).find((option) => transcriptMatchesChoice(liveTranscript, option));
    if (hit) choose(hit);
  }, [liveTranscript, game, won, summary]);

  function markWrong(choice: string) {
    setWrongPicks((current) => (current.includes(choice) ? current : [...current, choice]));
    setShaking(true);
    void playTryAgainSound();
    try {
      navigator.vibrate?.(12);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => setShaking(false), 420);
  }

  function choose(choice: string) {
    if (!game || won || summary) return;
    if (wrongPicks.includes(choice)) return;
    if (!isCorrectGameChoice(game, choice)) {
      markWrong(choice);
      return;
    }
    setWon(true);
    setPopped(choice);
    void playGameSfx(game.type === "fill_missing" ? "lock" : game.type === "listen_pick" ? "sparkle" : "bubble");
    try {
      navigator.vibrate?.([10, 40, 18]);
    } catch {
      /* ignore */
    }
    const nextAnswers = [...answers, choice];
    setAnswers(nextAnswers);
    onQuestionCorrect?.(choice, index);
    const last = index + 1 >= total;
    window.setTimeout(() => {
      if (last) {
        setSummary(true);
        void playGameSfx("win");
        window.setTimeout(() => onRoundComplete(nextAnswers), 1400);
        return;
      }
      setIndex((value) => value + 1);
      setWrongPicks([]);
      setWon(false);
      setPopped("");
    }, 900);
  }

  if (!game) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/70 p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:p-6">
      <header className="mx-auto flex w-full max-w-lg shrink-0 items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2 text-white">
            {Array.from({ length: GAME_ROUND_LENGTH }, (_, star) => (
              <span key={star} className={cn("text-xl sm:text-2xl", star < stage ? "opacity-100" : "opacity-30")}>
                ⭐ {star + 1}/{total}
              </span>
            ))}
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-amber-300"
              style={{ width: `${(stage / total) * 100}%` }}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Exit game"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/25 bg-white/10 text-lg text-white"
        >
          ✕
        </button>
      </header>

      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "mx-auto mt-4 flex min-h-0 w-full max-w-lg flex-1 flex-col overflow-y-auto rounded-[28px] border border-cyan-300/30 bg-white/10 p-4 shadow-[0_0_40px_rgba(34,211,238,0.18)] backdrop-blur-xl sm:p-6",
          shaking && "animate-shake border-rose-400",
        )}
      >
        {summary ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <p className="text-6xl">🎉</p>
            <p className="mt-3 text-2xl font-semibold text-white">Round Complete!</p>
            <p className="mt-1 text-lg text-amber-100">+{GAME_ROUND_XP} XP Earned!</p>
          </div>
        ) : (
          <>
            <p className="text-center text-lg font-semibold text-white sm:text-xl">{headline(game)}</p>
            <p className="mt-1 text-center text-sm text-white/70">+{GAME_XP_REWARD} XP</p>
            <div className="mt-4 flex flex-1 flex-col items-center justify-center">
              {game.type === "picture_match" ? (
                <BalloonBoard
                  data={game.data as PictureMatchData}
                  wrong={wrongPicks}
                  popped={popped}
                  disabled={won}
                  onPick={choose}
                />
              ) : game.type === "listen_pick" ? (
                <VoiceCrystal
                  data={game.data as ListenPickData}
                  listening={listening}
                  audioLevel={audioLevel}
                  unlocked={won}
                  onListen={() => onRequestListen?.()}
                />
              ) : (
                <LetterBoard
                  data={game.data as FillMissingData}
                  wrong={wrongPicks}
                  locked={won}
                  onPick={choose}
                />
              )}
            </div>
            {game.type !== "listen_pick" ? (
              <button
                type="button"
                onClick={() => onRequestListen?.()}
                className="mt-4 min-h-12 w-full rounded-2xl border border-cyan-300/40 bg-cyan-400/15 px-4 py-3 text-base font-semibold text-cyan-50"
              >
                {listening ? "Listening… say the word!" : "🎤 Hold or Speak · אמור את המילה בקול"}
              </button>
            ) : null}
          </>
        )}
      </motion.div>
    </div>
  );
}

function headline(game: ChatGame) {
  if (game.type === "picture_match") {
    const data = game.data as PictureMatchData;
    return `Pop the word: ${data.answer.toUpperCase()} ${data.emoji}`;
  }
  if (game.type === "listen_pick") return "Say it out loud to unlock the treasure!";
  return (game.data as FillMissingData).prompt;
}

function gameOptions(game: ChatGame) {
  if (game.type === "listen_pick") return (game.data as ListenPickData).options.map((item) => item.label);
  if (game.type === "fill_missing") return (game.data as FillMissingData).options;
  return (game.data as PictureMatchData).options;
}

function BalloonBoard({
  data,
  wrong,
  popped,
  disabled,
  onPick,
}: {
  data: PictureMatchData;
  wrong: string[];
  popped: string;
  disabled?: boolean;
  onPick: (choice: string) => void;
}) {
  return (
    <div className="flex w-full flex-wrap items-end justify-center gap-3 sm:gap-5">
      {data.options.map((label, index) => {
        const missed = wrong.includes(label);
        const burst = popped.toLowerCase() === label.toLowerCase();
        return (
          <button
            key={label}
            type="button"
            disabled={disabled || missed}
            onClick={() => onPick(label)}
            className={cn(
              "balloon-float relative flex w-24 flex-col items-center md:w-32",
              missed && "opacity-40 grayscale",
            )}
            style={{ animationDelay: `${index * 0.18}s` }}
          >
            <motion.span
              animate={burst ? { scale: [1, 1.3, 0], opacity: [1, 1, 0] } : { scale: 1, opacity: 1 }}
              transition={{ duration: burst ? 0.45 : 0.2 }}
              className={cn(
                "flex h-28 w-24 items-center justify-center rounded-[50%] bg-gradient-to-b text-center shadow-[0_12px_24px_rgba(0,0,0,0.35),inset_0_-10px_18px_rgba(0,0,0,0.25),inset_0_8px_12px_rgba(255,255,255,0.45)] md:h-36 md:w-32",
                BALLOON_SKINS[index % BALLOON_SKINS.length],
              )}
            >
              <span className="px-1 text-sm font-black uppercase leading-tight text-white drop-shadow md:text-lg">
                {data.emoji}
                <br />
                {label}
              </span>
            </motion.span>
            {burst ? <SparkBurst /> : null}
            <span className="mt-1 h-8 w-px bg-white/50" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}

function SparkBurst() {
  return (
    <div className="pointer-events-none absolute inset-0">
      {["✨", "★", "✦", "✺", "•", "✧"].map((item, index) => (
        <motion.span
          key={item + index}
          className="absolute left-1/2 top-1/2 text-lg"
          initial={{ x: 0, y: 0, opacity: 1 }}
          animate={{ x: Math.cos((index / 6) * Math.PI * 2) * 48, y: Math.sin((index / 6) * Math.PI * 2) * 48, opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          {item}
        </motion.span>
      ))}
    </div>
  );
}

function VoiceCrystal({
  data,
  listening,
  audioLevel,
  unlocked,
  onListen,
}: {
  data: ListenPickData;
  listening?: boolean;
  audioLevel?: number;
  unlocked?: boolean;
  onListen: () => void;
}) {
  const match = data.options.find((item) => item.label.toLowerCase() === data.answer.toLowerCase());
  const level = Math.max(0.12, listening ? audioLevel ?? 0.2 : 0.18);
  return (
    <div className="flex w-full flex-col items-center">
      <motion.div
        animate={{ scale: unlocked ? 1.08 : 1 + level * 0.12 }}
        className="relative flex h-44 w-44 items-center justify-center rounded-full border-4 border-cyan-300/70 bg-gradient-to-br from-violet-500/40 to-cyan-400/20 shadow-[0_0_40px_rgba(34,211,238,0.45)] md:h-52 md:w-52"
      >
        <span className="absolute inset-3 animate-pulse rounded-full border border-amber-300/50" />
        <div className="text-center">
          <p className="text-6xl md:text-7xl">{match?.emoji || "💎"}</p>
          <p className="mt-2 text-2xl font-black tracking-wide text-white">{data.answer.toUpperCase()}</p>
        </div>
      </motion.div>
      <div className="mt-5 flex h-12 items-end justify-center gap-1.5">
        {Array.from({ length: 12 }, (_, bar) => (
          <span
            key={bar}
            className="w-1.5 rounded-full bg-cyan-300"
            style={{
              height: `${14 + level * (18 + (bar % 5) * 8)}px`,
              opacity: listening ? 1 : 0.4,
            }}
          />
        ))}
      </div>
      <button
        type="button"
        onPointerDown={onListen}
        onClick={onListen}
        className="mt-5 min-h-14 w-full max-w-sm rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-3 text-base font-bold text-slate-950 shadow-[0_8px_24px_rgba(34,211,238,0.35)]"
      >
        {unlocked ? "Unlocked!" : listening ? "Listening… say it!" : "🎤 Hold or Speak / אמור את המילה בקול"}
      </button>
    </div>
  );
}

function LetterBoard({
  data,
  wrong,
  locked,
  onPick,
}: {
  data: FillMissingData;
  wrong: string[];
  locked?: boolean;
  onPick: (choice: string) => void;
}) {
  const parts = fillPatternParts(data.pattern);
  return (
    <div className="flex w-full flex-col items-center gap-8">
      <p className="text-4xl">{data.emoji}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {parts.map((part, index) => (
          <span
            key={`${part}-${index}`}
            className={cn(
              "flex h-14 min-w-14 items-center justify-center rounded-2xl border-2 px-3 font-mono text-2xl font-black",
              part === "_"
                ? "border-cyan-300 bg-cyan-400/20 text-cyan-100"
                : "border-white/20 bg-white/10 text-white",
            )}
          >
            {part === "_" ? "?" : part}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        {data.options.map((letter) => {
          const missed = wrong.includes(letter);
          const chosen = locked && letter.toLowerCase() === data.answer.toLowerCase();
          return (
            <motion.button
              key={letter}
              type="button"
              disabled={locked || missed}
              whileTap={{ scale: missed ? 1 : 0.9 }}
              onClick={() => onPick(letter)}
              className={cn(
                "flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-black shadow-lg md:h-20 md:w-20 md:text-3xl",
                chosen
                  ? "bg-emerald-400 text-emerald-950"
                  : missed
                    ? "bg-rose-400/40 text-rose-100 line-through"
                    : "bg-gradient-to-br from-amber-200 to-orange-400 text-slate-900",
              )}
            >
              {letter}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
