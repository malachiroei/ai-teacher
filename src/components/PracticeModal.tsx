"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, Gamepad2, Star, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DEFAULT_VOCAB, type VocabCard } from "@/lib/learning-vocab";

export type PracticeMode = "lesson" | "practice";

export type { VocabCard };

type EchoRound = { word: string; he: string; emoji: string };
type MatchPair = { id: string; en: string; he: string; emoji: string };
type QuizItem = { prompt: string; emoji: string; options: string[]; answer: string };

interface PracticeModalProps {
  tutorName: string;
  onClose: () => void;
  onSpeak: (text: string) => void;
  onFinish?: (xp: number) => void;
  vocab?: VocabCard[];
}

export function PracticeModal({
  tutorName,
  onClose,
  onSpeak,
  onFinish,
  vocab = DEFAULT_VOCAB,
}: PracticeModalProps) {
  const [mode, setMode] = useState<PracticeMode>("lesson");
  const [game, setGame] = useState<"menu" | "echo" | "match" | "quiz">("menu");
  const [echoIndex, setEchoIndex] = useState(0);
  const [echoStars, setEchoStars] = useState(0);
  const [matchLeft, setMatchLeft] = useState<MatchPair[]>([]);
  const [matchRight, setMatchRight] = useState<MatchPair[]>([]);
  const [selectedHe, setSelectedHe] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [feedback, setFeedback] = useState("");

  const echoRounds = useMemo<EchoRound[]>(
    () => vocab.slice(0, 4).map((item) => ({ word: item.en, he: item.he, emoji: item.emoji })),
    [vocab],
  );

  const quizItems = useMemo<QuizItem[]>(
    () =>
      vocab.slice(0, 3).map((item) => {
        const distractors = vocab
          .filter((other) => other.en !== item.en)
          .slice(0, 2)
          .map((other) => other.en);
        const options = [item.en, ...distractors].sort(() => Math.random() - 0.5);
        return {
          prompt: `What is ${item.he}?`,
          emoji: item.emoji,
          options,
          answer: item.en,
        };
      }),
    [vocab],
  );

  function startMatch() {
    const pairs = vocab.slice(0, 4).map((item, index) => ({
      id: `${item.en}-${index}`,
      en: item.en,
      he: item.he,
      emoji: item.emoji,
    }));
    setMatchLeft([...pairs].sort(() => Math.random() - 0.5));
    setMatchRight([...pairs].sort(() => Math.random() - 0.5));
    setMatched(new Set());
    setSelectedHe(null);
    setFeedback("");
    setGame("match");
  }

  function startEcho() {
    setEchoIndex(0);
    setEchoStars(0);
    setFeedback("");
    setGame("echo");
    const first = echoRounds[0];
    if (first) onSpeak(first.word);
  }

  function startQuiz() {
    setQuizIndex(0);
    setQuizScore(0);
    setFeedback("");
    setGame("quiz");
  }

  function scoreEcho(ok: boolean) {
    const nextStars = echoStars + (ok ? 1 : 0);
    setEchoStars(nextStars);
    setFeedback(ok ? "⭐ Great job!" : "Almost — try again!");
    if (ok) {
      const next = echoIndex + 1;
      if (next >= echoRounds.length) {
        setFeedback(`Done! You earned ${nextStars} stars ⭐`);
        onFinish?.(nextStars * 5);
        return;
      }
      setEchoIndex(next);
      onSpeak(echoRounds[next].word);
    } else {
      onSpeak(echoRounds[echoIndex]?.word || "");
    }
  }

  function tryMatch(enId: string, heIdOverride?: string | null) {
    const heId = heIdOverride ?? selectedHe;
    if (!heId) {
      setFeedback("Tap a Hebrew word first");
      return;
    }
    if (heId === enId) {
      const next = new Set(matched);
      next.add(enId);
      setMatched(next);
      setSelectedHe(null);
      setFeedback("Nice match! ✨");
      if (next.size >= matchLeft.length) {
        setFeedback("All matched! 🎉");
        onFinish?.(20);
      }
    } else {
      setFeedback("Not that one — try again");
      setSelectedHe(null);
    }
  }

  function answerQuiz(option: string) {
    const item = quizItems[quizIndex];
    if (!item) return;
    const ok = option === item.answer;
    const score = quizScore + (ok ? 1 : 0);
    setQuizScore(score);
    setFeedback(ok ? "Yes! ⭐" : `It's ${item.answer}`);
    window.setTimeout(() => {
      const next = quizIndex + 1;
      if (next >= quizItems.length) {
        setFeedback(`Quiz done — ${score}/${quizItems.length} correct!`);
        onFinish?.(score * 8);
        return;
      }
      setQuizIndex(next);
      setFeedback("");
    }, 700);
  }

  return (
    <div className="absolute inset-0 z-[70] flex items-end justify-center bg-sky-200/40 p-3 backdrop-blur-sm sm:items-center">
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="glass-panel relative flex max-h-[92%] w-full max-w-md flex-col overflow-hidden text-slate-800 shadow-2xl"
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.2em] text-emerald-300/80 uppercase">Learn with {tutorName}</p>
            <h2 className="text-lg font-semibold">Today&apos;s English unit</h2>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="rounded-full p-2 text-white/70 hover:bg-white/10">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 mb-3 flex rounded-full border border-white/12 bg-white/5 p-1">
          {(
            [
              { id: "lesson", label: "Lesson / שיעור", icon: BookOpen },
              { id: "practice", label: "Practice / תרגול", icon: Gamepad2 },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setMode(tab.id);
                setGame("menu");
              }}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-semibold transition",
                mode === tab.id ? "bg-emerald-400 text-slate-950" : "text-white/70 hover:bg-white/8",
              )}
            >
              <tab.icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5">
          {mode === "lesson" ? (
            <div className="space-y-3">
              <p className="text-sm text-white/65">Preview today&apos;s words — tap 🔊 to hear {tutorName}.</p>
              {vocab.map((card) => (
                <div
                  key={card.en}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold">
                      <span className="mr-2">{card.emoji}</span>
                      {card.en}
                    </p>
                    <p dir="rtl" className="text-sm text-white/60">
                      {card.he}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Play ${card.en}`}
                    onClick={() => onSpeak(card.en)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-400 text-slate-950"
                  >
                    <Volume2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMode("practice");
                  setGame("menu");
                }}
                className="mt-2 flex h-12 w-full items-center justify-center rounded-full bg-emerald-400 text-[15px] font-semibold text-slate-950"
              >
                Start practice games →
              </button>
            </div>
          ) : game === "menu" ? (
            <div className="space-y-3">
              <button type="button" onClick={startEcho} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
                <p className="text-[15px] font-semibold">Echo Game · חזור אחריי</p>
                <p className="mt-1 text-sm text-white/60">{tutorName} says a word — you repeat it for stars ⭐</p>
              </button>
              <button type="button" onClick={startMatch} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
                <p className="text-[15px] font-semibold">Word Match · התאמת מילים</p>
                <p className="mt-1 text-sm text-white/60">Match Hebrew words to English cards</p>
              </button>
              <button type="button" onClick={startQuiz} className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left">
                <p className="text-[15px] font-semibold">Quick Quiz · חידון</p>
                <p className="mt-1 text-sm text-white/60">3 fast visual questions</p>
              </button>
            </div>
          ) : game === "echo" ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-white/60">
                Round {Math.min(echoIndex + 1, echoRounds.length)} / {echoRounds.length}
              </p>
              <p className="text-5xl">{echoRounds[echoIndex]?.emoji}</p>
              <p className="text-2xl font-semibold">{echoRounds[echoIndex]?.word}</p>
              <p dir="rtl" className="text-white/55">
                {echoRounds[echoIndex]?.he}
              </p>
              <div className="flex justify-center gap-1">
                {Array.from({ length: echoRounds.length }).map((_, i) => (
                  <Star key={i} className={cn("h-5 w-5", i < echoStars ? "fill-amber-300 text-amber-300" : "text-white/25")} />
                ))}
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => onSpeak(echoRounds[echoIndex]?.word || "")} className="flex-1 rounded-full border border-white/15 py-3 font-semibold">
                  Hear again
                </button>
                <button type="button" onClick={() => scoreEcho(true)} className="flex-1 rounded-full bg-emerald-400 py-3 font-semibold text-slate-950">
                  I said it ⭐
                </button>
              </div>
              {feedback ? <p className="text-sm text-amber-200">{feedback}</p> : null}
            </div>
          ) : game === "match" ? (
            <div className="space-y-3">
              <p className="text-sm text-white/65">Drag a Hebrew word onto the English card — or tap to match.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  {matchRight.map((item) => (
                    <button
                      key={`he-${item.id}`}
                      type="button"
                      draggable={!matched.has(item.id)}
                      disabled={matched.has(item.id)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData("text/plain", item.id);
                        setSelectedHe(item.id);
                      }}
                      onClick={() => setSelectedHe(item.id)}
                      className={cn(
                        "w-full cursor-grab rounded-xl border px-3 py-3 text-sm font-semibold active:cursor-grabbing",
                        matched.has(item.id)
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-100"
                          : selectedHe === item.id
                            ? "border-amber-300 bg-amber-300/15"
                            : "border-white/12 bg-white/5",
                      )}
                    >
                      {item.he}
                    </button>
                  ))}
                </div>
                <div className="space-y-2">
                  {matchLeft.map((item) => (
                    <div
                      key={`en-${item.id}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const heId = event.dataTransfer.getData("text/plain") || selectedHe;
                        tryMatch(item.id, heId);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border px-3 py-2",
                        matched.has(item.id) ? "border-emerald-400/40 bg-emerald-400/10" : "border-white/12 bg-white/5",
                      )}
                    >
                      <button
                        type="button"
                        disabled={matched.has(item.id)}
                        onClick={() => tryMatch(item.id)}
                        className="min-w-0 flex-1 text-left text-sm font-semibold"
                      >
                        <span className="mr-1">{item.emoji}</span>
                        {item.en}
                      </button>
                      <button
                        type="button"
                        aria-label={`Play ${item.en}`}
                        onClick={() => onSpeak(item.en)}
                        className="rounded-full p-2 text-emerald-200 hover:bg-white/10"
                      >
                        <Volume2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              {feedback ? <p className="text-center text-sm text-amber-200">{feedback}</p> : null}
            </div>
          ) : (
            <div className="space-y-4 text-center">
              <p className="text-sm text-white/60">
                Question {Math.min(quizIndex + 1, quizItems.length)} / {quizItems.length}
              </p>
              <p className="text-5xl">{quizItems[quizIndex]?.emoji}</p>
              <p className="text-lg font-semibold">{quizItems[quizIndex]?.prompt}</p>
              <div className="grid gap-2">
                {quizItems[quizIndex]?.options.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => answerQuiz(option)}
                    className="rounded-full border border-white/12 bg-white/5 py-3 text-[15px] font-semibold hover:bg-white/10"
                  >
                    {option}
                  </button>
                ))}
              </div>
              {feedback ? <p className="text-sm text-amber-200">{feedback}</p> : null}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
