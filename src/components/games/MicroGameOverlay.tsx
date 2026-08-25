"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import {
  GAME_ROUND_LENGTH,
  GAME_ROUND_XP,
  GAME_XP_REWARD,
  emojiForOptionLabel,
  fillPatternParts,
  getGameAnswer,
  isCorrectGameChoice,
  transcriptMatchesChoice,
  type ChatGame,
  type FillMissingData,
  type ListenPickData,
  type MathMatchData,
  type PictureMatchData,
} from "@/lib/chat-games";
import { playGameSfx, playTryAgainSound } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

function getGameRecognition() {
  if (typeof window === "undefined") return null;
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  return Ctor ? new Ctor() : null;
}

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
  isSpeaking?: boolean;
  audioLevel?: number;
  onRequestListen?: () => void;
  onStopListen?: () => void;
  onStopSpeaking?: () => void;
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
  audioLevel = 0,
  onStopListen,
  onStopSpeaking,
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
  const [talkState, setTalkState] = useState<"idle" | "listening">("idle");
  const [heardPreview, setHeardPreview] = useState("");
  const heardRef = useRef("");
  const hasSpokenStageRef = useRef<number | null>(null);
  const speakPromptRef = useRef(onSpeakPrompt);
  const stopListenRef = useRef(onStopListen);
  const stopSpeakRef = useRef(onStopSpeaking);
  const recRef = useRef<ReturnType<typeof getGameRecognition>>(null);
  const talkTimerRef = useRef<number | null>(null);
  const listenGenRef = useRef(0);
  const lastTapRef = useRef(0);
  speakPromptRef.current = onSpeakPrompt;
  stopListenRef.current = onStopListen;
  stopSpeakRef.current = onStopSpeaking;

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
    hasSpokenStageRef.current = null;
    setTalkState("idle");
    setHeardPreview("");
  }, [games]);

  function abortGameListen() {
    listenGenRef.current += 1;
    if (talkTimerRef.current != null) {
      window.clearTimeout(talkTimerRef.current);
      talkTimerRef.current = null;
    }
    const rec = recRef.current;
    recRef.current = null;
    if (rec) {
      rec.onresult = null;
      rec.onerror = null;
      rec.onend = null;
      try {
        rec.stop();
      } catch {
        try {
          rec.abort();
        } catch {
          /* ignore */
        }
      }
    }
    setTalkState("idle");
  }

  function startPushToTalk() {
    if (won || summary || !game) return;
    abortGameListen();
    stopListenRef.current?.();
    stopSpeakRef.current?.();
    const gen = listenGenRef.current;
    const deadline = Date.now() + 7500;
    const targets = gameOptions(game);
    setHeardPreview("");
    setTalkState("listening");

    const finishIdle = () => {
      if (listenGenRef.current !== gen) return;
      abortGameListen();
    };

    const handleBlob = (blob: string) => {
      if (listenGenRef.current !== gen) return;
      const heard = blob.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
      if (heard) setHeardPreview(heard);
      const hit = targets.find((option) => transcriptMatchesChoice(heard, option));
      if (hit) {
        abortGameListen();
        choose(hit);
      }
    };

    const startRec = () => {
      if (listenGenRef.current !== gen || Date.now() >= deadline) {
        finishIdle();
        return;
      }
      const rec = getGameRecognition();
      if (!rec) {
        finishIdle();
        return;
      }
      rec.lang = "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 3;
      recRef.current = rec;
      rec.onresult = (event) => {
        let blob = "";
        for (let i = 0; i < event.results.length; i += 1) {
          blob += ` ${event.results[i][0]?.transcript ?? ""}`;
        }
        handleBlob(blob);
      };
      rec.onerror = (event) => {
        const err = String(event.error || "");
        if (err === "no-speech" || err === "aborted") return;
        if (err === "not-allowed" || err === "service-not-allowed") {
          finishIdle();
        }
      };
      rec.onend = () => {
        if (listenGenRef.current !== gen) return;
        if (Date.now() < deadline) {
          window.setTimeout(() => {
            if (listenGenRef.current !== gen) return;
            try {
              rec.start();
            } catch {
              startRec();
            }
          }, 120);
          return;
        }
        finishIdle();
      };
      try {
        rec.start();
      } catch {
        window.setTimeout(() => {
          if (listenGenRef.current !== gen) return;
          startRec();
        }, 200);
      }
    };

    talkTimerRef.current = window.setTimeout(() => finishIdle(), 8000);
    window.setTimeout(startRec, 350);
  }

  const answerKey = game ? getGameAnswer(game) : "";

  useEffect(() => {
    if (!game || summary) return;
    if (hasSpokenStageRef.current === index) return;
    hasSpokenStageRef.current = index;
    heardRef.current = "";
    setHeardPreview("");
    abortGameListen();
    stopListenRef.current?.();
    const line =
      game.type === "picture_match"
        ? `Pop the word: ${game.data.answer}!`
        : game.type === "math_match"
          ? `What is ${(game.data as MathMatchData).equation}`
        : game.type === "listen_pick"
          ? `Say it out loud to unlock the treasure! ${(game.data as ListenPickData).speak}`
          : `Tap the missing letter!`;
    const speakTimer = window.setTimeout(() => {
      if (hasSpokenStageRef.current !== index) return;
      speakPromptRef.current?.(line);
    }, 80);
    return () => window.clearTimeout(speakTimer);
  }, [index, summary, game, answerKey]);

  useEffect(() => {
    return () => {
      abortGameListen();
      stopListenRef.current?.();
      stopSpeakRef.current?.();
    };
  }, []);

  function tapChoice(choice: string, event?: { preventDefault: () => void; stopPropagation: () => void }) {
    event?.preventDefault();
    event?.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 220) return;
    lastTapRef.current = now;
    if (game?.type === "fill_missing") void playGameSfx("bounce");
    else void playGameSfx("bubble");
    choose(choice);
  }

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
    abortGameListen();
    stopListenRef.current?.();
    stopSpeakRef.current?.();
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
                  onPick={tapChoice}
                />
              ) : game.type === "math_match" ? (
                <MathBalloonBoard
                  data={game.data as MathMatchData}
                  wrong={wrongPicks}
                  popped={popped}
                  disabled={won}
                  onPick={tapChoice}
                />
              ) : game.type === "listen_pick" ? (
                <VoiceCrystal
                  data={game.data as ListenPickData}
                  listening={talkState === "listening"}
                  heardPreview={heardPreview}
                  audioLevel={audioLevel}
                  unlocked={won}
                  onListen={startPushToTalk}
                  onUnlock={() => tapChoice((game.data as ListenPickData).answer)}
                />
              ) : (
                <LetterBoard
                  data={game.data as FillMissingData}
                  wrong={wrongPicks}
                  locked={won}
                  onPick={tapChoice}
                />
              )}
            </div>
            {game.type !== "listen_pick" ? (
              <button
                type="button"
                onClick={startPushToTalk}
                onTouchEnd={(event) => {
                  event.preventDefault();
                  startPushToTalk();
                }}
                className="mt-4 min-h-12 w-full touch-manipulation rounded-2xl border border-cyan-300/40 bg-cyan-400/15 px-4 py-3 text-base font-semibold text-cyan-50"
              >
                {talkState === "listening"
                  ? heardPreview
                    ? `Heard: “${heardPreview}”`
                    : "Listening… say the word!"
                  : "🎤 Tap to Speak · אמור את המילה בקול"}
              </button>
            ) : null}
          </>
        )}
      </motion.div>
    </div>
  );
}

function headline(game: ChatGame) {
  if (game.type === "math_match") {
    const data = game.data as MathMatchData;
    return `${data.equation} ${data.emoji || "➕"}`;
  }
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
  if (game.type === "math_match") return (game.data as MathMatchData).options;
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
        const icon = emojiForOptionLabel(label);
        return (
          <button
            key={label}
            type="button"
            disabled={disabled || missed}
            onPointerUp={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPick(label);
            }}
            onTouchEnd={(event) => {
              event.preventDefault();
              onPick(label);
            }}
            onClick={(event) => {
              event.preventDefault();
              onPick(label);
            }}
            className={cn(
              "balloon-float relative flex w-24 touch-manipulation flex-col items-center md:w-32",
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
              <span className="px-2 text-sm font-black uppercase leading-tight text-white drop-shadow md:text-lg">
                {icon ? (
                  <>
                    <span className="mb-0.5 block text-2xl md:text-3xl">{icon}</span>
                    {label}
                  </>
                ) : (
                  label
                )}
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

function MathBalloonBoard({
  data,
  wrong,
  popped,
  disabled,
  onPick,
}: {
  data: MathMatchData;
  wrong: string[];
  popped: string;
  disabled?: boolean;
  onPick: (choice: string) => void;
}) {
  return (
    <div className="flex w-full flex-col items-center">
      <p className="mb-4 rounded-2xl border border-amber-300/40 bg-amber-400/15 px-4 py-3 text-center text-2xl font-black tracking-wide text-amber-100 md:text-3xl">
        {data.equation}
      </p>
      <BalloonBoard
        data={{
          prompt: data.prompt,
          emoji: data.emoji || "➕",
          options: data.options,
          answer: data.answer,
        }}
        wrong={wrong}
        popped={popped}
        disabled={disabled}
        onPick={onPick}
      />
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
  heardPreview,
  audioLevel,
  unlocked,
  onListen,
  onUnlock,
}: {
  data: ListenPickData;
  listening?: boolean;
  heardPreview?: string;
  audioLevel?: number;
  unlocked?: boolean;
  onListen: () => void;
  onUnlock: () => void;
}) {
  const match = data.options.find((item) => item.label.toLowerCase() === data.answer.toLowerCase());
  const level = Math.max(0.12, listening ? audioLevel ?? 0.2 : 0.18);
  return (
    <div className="flex w-full flex-col items-center">
      <button
        type="button"
        disabled={unlocked}
        onPointerUp={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onUnlock();
        }}
        onTouchEnd={(event) => {
          event.preventDefault();
          onUnlock();
        }}
        onClick={(event) => {
          event.preventDefault();
          onUnlock();
        }}
        className="touch-manipulation"
      >
        <motion.div
          animate={{ scale: unlocked ? 1.08 : 1 + level * 0.12 }}
          className="relative flex h-44 w-44 items-center justify-center rounded-full border-4 border-cyan-300/70 bg-gradient-to-br from-violet-500/40 to-cyan-400/20 shadow-[0_0_40px_rgba(34,211,238,0.45)] md:h-52 md:w-52"
        >
          <span className="absolute inset-3 animate-pulse rounded-full border border-amber-300/50" />
          <div className="text-center">
            <p className="text-6xl md:text-7xl">{match?.emoji || "💎"}</p>
            <p className="mt-2 text-2xl font-black tracking-wide text-white">{data.answer.toUpperCase()}</p>
            <p className="mt-1 text-[11px] font-semibold text-cyan-100">Tap to unlock</p>
          </div>
        </motion.div>
      </button>
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
        onClick={onListen}
        className="mt-5 min-h-14 w-full max-w-sm touch-manipulation rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-4 py-3 text-base font-bold text-slate-950 shadow-[0_8px_24px_rgba(34,211,238,0.35)]"
      >
        {unlocked
          ? "Unlocked!"
          : listening
            ? heardPreview
              ? `Heard: “${heardPreview}”`
              : "Listening… say it!"
            : "🎤 Tap to Speak / אמור את המילה בקול"}
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
              onPointerUp={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onPick(letter);
              }}
              onTouchEnd={(event) => {
                event.preventDefault();
                onPick(letter);
              }}
              onClick={(event) => {
                event.preventDefault();
                onPick(letter);
              }}
              className={cn(
                "flex h-16 w-16 touch-manipulation items-center justify-center rounded-2xl text-2xl font-black shadow-lg md:h-20 md:w-20 md:text-3xl",
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
