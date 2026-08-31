"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Star, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { playGameSfx } from "@/hooks/useNotifications";
import { DEFAULT_VOCAB, type VocabCard } from "@/lib/learning-vocab";

type Stage = "flashcard" | "echo" | "builder" | "complete";

interface GameModalProps {
  tutorName: string;
  onClose: () => void;
  onSpeak: (text: string) => void;
  onFinish?: (xp: number) => void;
  audioLevel?: number;
  listening?: boolean;
  vocab?: VocabCard[];
}

export function GameModal({
  tutorName,
  onClose,
  onSpeak,
  onFinish,
  audioLevel = 0,
  listening = false,
  vocab = DEFAULT_VOCAB,
}: GameModalProps) {
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<Stage>("flashcard");
  const [cardIndex, setCardIndex] = useState(0);
  const [echoStars, setEchoStars] = useState(0);
  const [builderWord, setBuilderWord] = useState("");
  const [builderDone, setBuilderDone] = useState(false);
  const [feedback, setFeedback] = useState("");

  const cards = useMemo(() => vocab.slice(0, 3), [vocab]);
  const card = cards[cardIndex];
  const targetWord = card?.en ?? "Hello";
  const letters = useMemo(
    () => [...targetWord.toUpperCase()].sort(() => Math.random() - 0.5),
    [targetWord],
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (stage === "flashcard" && card) onSpeak(card.en);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- speak once per card/stage
  }, [stage, cardIndex, card?.en]);

  useEffect(() => {
    if (stage === "echo" && card) onSpeak(card.en);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, cardIndex, card?.en]);

  useEffect(() => {
    if (stage === "builder") {
      setBuilderWord("");
      setBuilderDone(false);
    }
  }, [stage, cardIndex]);

  function nextCardOrFinish() {
    const next = cardIndex + 1;
    if (next >= cards.length) {
      setStage("complete");
      void playGameSfx("win");
      onFinish?.(30 + echoStars * 5);
      return;
    }
    setCardIndex(next);
    setStage("flashcard");
    setFeedback("");
  }

  function tapLetter(letter: string) {
    if (builderDone) return;
    void playGameSfx("bounce");
    const next = builderWord + letter;
    setBuilderWord(next);
    const expected = targetWord.toUpperCase();
    if (next === expected) {
      setBuilderDone(true);
      setFeedback("Perfect word! ⭐");
      void playGameSfx("sparkle");
      window.setTimeout(() => nextCardOrFinish(), 900);
    } else if (!expected.startsWith(next)) {
      setFeedback("Try again!");
      setBuilderWord("");
      void playGameSfx("bounce");
    }
  }

  if (!mounted || typeof document === "undefined") return null;

  const level = Math.max(0.15, listening ? audioLevel : 0.12);

  return createPortal(
    <div className="game-modal-shell fixed inset-0 z-[85] flex flex-col overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-sky-100 via-violet-50 to-amber-50" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(56,189,248,0.35),transparent_45%),radial-gradient(circle_at_80%_20%,rgba(251,191,36,0.28),transparent_40%)]" />

      <header className="relative z-10 flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div>
          <p className="text-[11px] font-bold tracking-[0.18em] text-violet-600 uppercase">Quick Game · משחקון</p>
          <p className="text-lg font-bold text-slate-800">Play with {tutorName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="glass-badge rounded-full px-3 py-1 text-sm font-bold text-amber-700">
            ⭐ {echoStars}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close game"
            className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/70 bg-white/80 text-slate-700 shadow-lg backdrop-blur-md"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </header>

      <div className="relative z-10 mx-4 mb-2 h-2 overflow-hidden rounded-full bg-white/60 shadow-inner">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-violet-400 to-amber-400"
          animate={{
            width:
              stage === "complete"
                ? "100%"
                : `${((cardIndex + (stage === "flashcard" ? 0.2 : stage === "echo" ? 0.55 : 0.85)) / cards.length) * 100}%`,
          }}
        />
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <AnimatePresence mode="wait">
          {stage === "complete" ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-panel mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center text-center"
            >
              <p className="text-7xl">🎉</p>
              <p className="mt-4 text-2xl font-black text-slate-800">Amazing!</p>
              <p className="mt-2 text-base text-slate-600">+{30 + echoStars * 5} XP earned</p>
              <button
                type="button"
                onClick={onClose}
                className="mt-6 rounded-full bg-gradient-to-r from-violet-500 to-cyan-400 px-8 py-3 text-base font-bold text-white shadow-lg"
              >
                Back to chat
              </button>
            </motion.div>
          ) : stage === "flashcard" && card ? (
            <motion.div
              key={`flash-${cardIndex}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass-panel mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center"
            >
              <p className="text-sm font-semibold text-violet-600">Flashcard & Listen · כרטיסייה</p>
              <motion.p
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ repeat: Infinity, duration: 2.4 }}
                className="mt-6 text-8xl drop-shadow-lg"
              >
                {card.emoji}
              </motion.p>
              <p className="mt-4 text-3xl font-black tracking-tight text-slate-800">{card.en}</p>
              <p dir="rtl" className="mt-2 text-lg text-slate-500">
                {card.he}
              </p>
              <button
                type="button"
                onClick={() => onSpeak(card.en)}
                className="mt-6 flex items-center gap-2 rounded-full bg-white px-5 py-3 text-base font-bold text-violet-700 shadow-md ring-2 ring-violet-200"
              >
                <Volume2 className="h-5 w-5" />
                Hear again
              </button>
              <button
                type="button"
                onClick={() => setStage("echo")}
                className="mt-4 w-full max-w-xs rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 py-3.5 text-base font-bold text-white shadow-lg"
              >
                Next: Echo game →
              </button>
            </motion.div>
          ) : stage === "echo" && card ? (
            <motion.div
              key={`echo-${cardIndex}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="glass-panel mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center"
            >
              <p className="text-sm font-semibold text-violet-600">Echo · חזור אחריי</p>
              <p className="mt-4 text-6xl">{card.emoji}</p>
              <p className="mt-3 text-2xl font-black text-slate-800">{card.en}</p>
              <div className="mt-6 flex h-14 items-end justify-center gap-1.5">
                {Array.from({ length: 14 }, (_, bar) => (
                  <motion.span
                    key={bar}
                    className="w-2 rounded-full bg-gradient-to-t from-violet-500 to-cyan-400"
                    animate={{
                      height: `${12 + level * (22 + (bar % 6) * 10)}px`,
                      opacity: listening ? 1 : 0.45,
                    }}
                    transition={{ duration: 0.08 }}
                  />
                ))}
              </div>
              <div className="mt-4 flex gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Star
                    key={i}
                    className={cn("h-6 w-6", i < echoStars ? "fill-amber-400 text-amber-400" : "text-slate-300")}
                  />
                ))}
              </div>
              <div className="mt-6 flex w-full max-w-sm gap-2">
                <button
                  type="button"
                  onClick={() => onSpeak(card.en)}
                  className="flex-1 rounded-full border-2 border-violet-200 bg-white py-3 font-bold text-violet-700"
                >
                  🔊 Hear
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEchoStars((s) => s + 1);
                    setFeedback("⭐ Great echo!");
                    void playGameSfx("bubble");
                    window.setTimeout(() => setStage("builder"), 600);
                  }}
                  className="flex-1 rounded-full bg-gradient-to-r from-amber-400 to-orange-400 py-3 font-bold text-white shadow-md"
                >
                  I said it!
                </button>
              </div>
              {feedback ? <p className="mt-3 text-sm font-semibold text-amber-600">{feedback}</p> : null}
            </motion.div>
          ) : (
            <motion.div
              key={`build-${cardIndex}`}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-panel mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center p-6 text-center"
            >
              <p className="text-sm font-semibold text-violet-600">Word Builder · בניית מילה</p>
              <p className="mt-4 text-5xl">{card?.emoji}</p>
              <p dir="rtl" className="mt-2 text-base text-slate-500">
                {card?.he}
              </p>
              <div className="mt-5 flex min-h-14 flex-wrap justify-center gap-2">
                {targetWord.toUpperCase().split("").map((_, i) => (
                  <span
                    key={i}
                    className="flex h-14 w-12 items-center justify-center rounded-2xl border-2 border-dashed border-violet-300 bg-white/90 text-2xl font-black text-violet-700 shadow-sm"
                  >
                    {builderWord[i] ?? ""}
                  </span>
                ))}
              </div>
              <div className="mt-6 flex flex-wrap justify-center gap-2">
                {letters.map((letter, i) => (
                  <motion.button
                    key={`${letter}-${i}`}
                    type="button"
                    disabled={builderDone}
                    whileTap={{ scale: 0.88, y: 4 }}
                    onClick={() => tapLetter(letter)}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-200 to-orange-300 text-2xl font-black text-slate-800 shadow-[0_6px_0_rgba(180,83,9,0.35)] active:shadow-none"
                  >
                    {letter}
                  </motion.button>
                ))}
              </div>
              {feedback ? <p className="mt-4 text-sm font-semibold text-emerald-600">{feedback}</p> : null}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>,
    document.body,
  );
}
