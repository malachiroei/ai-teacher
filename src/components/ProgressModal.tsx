"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useUserProgress } from "@/hooks/useUserProgress";
import type { LearningSnapshot } from "@/lib/learning-progress";
import type { ArchivedChatSession } from "@/lib/chat-history";
import type { Message } from "@/types/chat";
import { cn } from "@/lib/utils";

interface ProgressModalProps {
  xp: number;
  messages: Message[];
  sessions: ArchivedChatSession[];
  weekMinutes: Record<string, number>;
  tutorsMet: string[];
  currentTutorId: string;
  goalMinutes: number;
  practicedMinutesToday: number;
  gamesWon?: number;
  onClose: () => void;
}

export function ProgressModal({
  xp,
  messages,
  sessions,
  weekMinutes,
  tutorsMet,
  currentTutorId,
  goalMinutes,
  practicedMinutesToday,
  gamesWon = 0,
  onClose,
}: ProgressModalProps) {
  const snapshot = useUserProgress({
    xp,
    messages,
    sessions,
    weekMinutes,
    tutorsMet,
    currentTutorId,
    goalMinutes,
    practicedMinutesToday,
    gamesWon,
  });

  return (
    <div className="absolute inset-0 z-[70] flex items-end justify-center p-3 sm:items-center">
      <motion.button
        type="button"
        className="absolute inset-0 bg-black/60"
        aria-label="Close progress"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />
      <motion.div
        initial={{ y: 32, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative flex max-h-[92%] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-amber-300/20 bg-[#0c100c] shadow-[0_0_40px_rgba(251,191,36,0.12)]"
      >
        <header className="flex items-start justify-between px-4 pt-4 pb-2">
          <div>
            <p className="text-[11px] font-semibold tracking-wide text-amber-200/70 uppercase">Learning Progress</p>
            <h2 className="mt-1 text-[18px] font-bold text-amber-50">
              {snapshot.current.emoji} Lv.{snapshot.current.level} {snapshot.current.title}
            </h2>
            <p className="text-[12px] text-white/50">{snapshot.xpLabel}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-full text-white/50 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-5">
          <section className="rounded-2xl border border-amber-300/15 bg-amber-400/8 p-3">
            <div className="mb-2 flex items-center justify-between text-[12px] text-amber-100/80">
              <span>Next level</span>
              <span>🔥 {snapshot.streak} day streak</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-black/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-emerald-300 shadow-[0_0_12px_rgba(251,191,36,0.65)]"
                style={{ width: `${snapshot.percent}%` }}
              />
            </div>
          </section>

          <SkillList snapshot={snapshot} />

          <section>
            <p className="mb-2 text-[13px] font-semibold text-white">Weekly practice / ימי תרגול שבועיים</p>
            <div className="grid grid-cols-7 gap-1.5">
              {snapshot.days.map((day) => (
                <div key={day.key} className="flex flex-col items-center gap-1">
                  <div
                    className={cn(
                      "flex h-12 w-full items-end justify-center rounded-xl border",
                      day.complete ? "border-emerald-400/40 bg-emerald-400/15" : "border-white/10 bg-white/5",
                    )}
                  >
                    <div
                      className={cn("w-2 rounded-t-full", day.complete ? "bg-emerald-300" : "bg-amber-300/70")}
                      style={{ height: day.minutes <= 0 ? "0%" : `${Math.min(100, (day.minutes / Math.max(1, day.goalMinutes)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-white/45">{day.label}</span>
                  <span className="text-[9px] text-white/35">{day.complete ? "✅" : `${day.minutes}/${day.goalMinutes}`}</span>
                </div>
              ))}
            </div>
          </section>

          <section>
            <p className="mb-2 text-[13px] font-semibold text-white">Milestones / תגי הישגים</p>
            <div className="grid grid-cols-2 gap-2">
              {snapshot.achievements.map((item) => (
                <div
                  key={item.id}
                  className={cn(
                    "rounded-2xl border px-3 py-2.5",
                    item.unlocked ? "border-amber-300/30 bg-amber-400/10" : "border-white/8 bg-white/[0.03] opacity-55",
                  )}
                >
                  <p className="text-[16px]">{item.emoji}</p>
                  <p className="mt-1 text-[12px] font-semibold text-white">{item.title}</p>
                  <p className="text-[11px] text-white/45">{item.hint}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </motion.div>
    </div>
  );
}

function SkillList({ snapshot }: { snapshot: LearningSnapshot }) {
  return (
    <section className="space-y-2">
      {snapshot.skills.map((skill) => (
        <div key={skill.id} className="rounded-2xl border border-white/8 bg-white/[0.04] px-3 py-2.5">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-white">
              {skill.emoji} {skill.title}
            </p>
            <span className="text-[11px] font-semibold text-amber-200">
              {skill.percent}% · {skill.band}
            </span>
          </div>
          <p className="mb-1 text-[11px] text-white/40">{skill.titleHe}</p>
          {skill.detail ? <p className="mb-1 text-[11px] text-white/55">{skill.detail}</p> : null}
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300" style={{ width: `${skill.percent}%` }} />
          </div>
        </div>
      ))}
    </section>
  );
}
