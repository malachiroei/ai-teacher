"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  GAME_ROUND_LENGTH,
  GAME_ROUND_XP,
  GAME_XP_REWARD,
  isCorrectGameChoice,
  transcriptMatchesChoice,
  type ChatGame,
  type FillMissingData,
  type ListenPickData,
  type PictureMatchData,
} from "@/lib/chat-games";
import { playGameSfx, playTryAgainSound } from "@/hooks/useNotifications";
import {
  BalloonBlastScene,
  LetterLaunchScene,
  MiniGameCanvas,
  VoiceChestScene,
} from "@/components/games/MicroGameScenes";
import { cn } from "@/lib/utils";

interface ChatGameCardProps {
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

export function ChatGameCard({
  games,
  liveTranscript = "",
  listening = false,
  audioLevel = 0,
  onRequestListen,
  onSpeakPrompt,
  onQuestionCorrect,
  onRoundComplete,
  onClose,
}: ChatGameCardProps) {
  const [index, setIndex] = useState(0);
  const [wrongPicks, setWrongPicks] = useState<string[]>([]);
  const [shaking, setShaking] = useState(false);
  const [won, setWon] = useState(false);
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
          : `Launch the missing letter into the slot!`;
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
    }, 900);
  }

  if (!game) return null;

  return (
    <div className="absolute inset-x-2 bottom-[6.4rem] top-[22%] z-40 flex justify-center">
      <motion.div
        initial={{ y: 24, opacity: 0, scale: 0.92 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        className={cn(
          "relative flex w-full max-w-md flex-col overflow-hidden rounded-[28px] border p-4 shadow-[0_0_40px_rgba(34,211,238,0.22)] backdrop-blur-2xl",
          shaking
            ? "animate-shake border-rose-400/80 bg-rose-500/10"
            : "border-cyan-300/35 bg-white/10",
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {Array.from({ length: GAME_ROUND_LENGTH }, (_, star) => (
              <span
                key={star}
                className={cn(
                  "text-lg drop-shadow-[0_0_8px_rgba(250,204,21,0.55)]",
                  star < stage ? "opacity-100" : "opacity-25",
                )}
              >
                ⭐
              </span>
            ))}
            <span className="ml-1 text-[11px] font-semibold tracking-wide text-cyan-100 uppercase">
              {stage}/{total}
            </span>
          </div>
          <button type="button" onClick={onClose} className="text-[11px] text-white/45">
            Skip
          </button>
        </div>
        {summary ? (
          <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
            <p className="text-4xl">🎉</p>
            <p className="mt-2 text-[20px] font-semibold text-white">Round Complete!</p>
            <p className="mt-1 text-[14px] text-amber-100">+{GAME_ROUND_XP} XP Earned!</p>
          </div>
        ) : (
          <>
            <p className="mb-1 text-center text-[13px] font-semibold text-white">{headline(game)}</p>
            <p className="mb-2 text-center text-[11px] text-white/55">+{GAME_XP_REWARD} XP · tap, drag, or say it</p>
            <MiniGameCanvas>
              {game.type === "fill_missing" ? (
                <LetterLaunchScene
                  data={game.data as FillMissingData}
                  lockedLetter={won ? (game.data as FillMissingData).answer : undefined}
                  onDropLetter={(letter, hitSlot) => {
                    if (hitSlot) choose(letter);
                  }}
                />
              ) : game.type === "listen_pick" ? (
                <VoiceChestScene
                  data={game.data as ListenPickData}
                  listening={listening}
                  level={audioLevel}
                  unlocked={won}
                />
              ) : (
                <BalloonBlastScene
                  data={game.data as PictureMatchData}
                  disabled={won}
                  wrong={wrongPicks}
                  won={won}
                  onPick={choose}
                />
              )}
            </MiniGameCanvas>
            {game.type === "listen_pick" ? (
              <div className="mt-3 flex flex-col items-center gap-2">
                <div className="flex h-8 items-end justify-center gap-1">
                  {Array.from({ length: 9 }, (_, bar) => (
                    <span
                      key={bar}
                      className="w-1 rounded-full bg-cyan-300"
                      style={{
                        height: `${8 + Math.max(0.08, listening ? audioLevel : 0.12) * (12 + (bar % 4) * 10)}px`,
                        opacity: listening ? 0.95 : 0.35,
                      }}
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => onRequestListen?.()}
                  className="text-[12px] font-semibold text-cyan-100"
                >
                  {listening ? "Listening… say the word!" : "🎙️ Tap to speak"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onRequestListen?.()}
                className="mt-2 text-center text-[12px] font-semibold text-cyan-100/80"
              >
                {listening ? "Listening for the word…" : "🎙️ Or say the word"}
              </button>
            )}
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
