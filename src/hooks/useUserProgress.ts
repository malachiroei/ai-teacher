"use client";

import { useMemo } from "react";
import { buildLearningSnapshot } from "@/lib/learning-progress";
import type { Message } from "@/types/chat";

export function useUserProgress(input: {
  xp: number;
  messages: Message[];
  sessions: Array<{ characterId: string; messages: Message[] }>;
  weekMinutes: Record<string, number>;
  tutorsMet: string[];
  currentTutorId: string;
  goalMinutes: number;
  practicedMinutesToday: number;
  gamesWon?: number;
}) {
  return useMemo(
    () => buildLearningSnapshot(input),
    [
      input.xp,
      input.messages,
      input.sessions,
      input.weekMinutes,
      input.tutorsMet,
      input.currentTutorId,
      input.goalMinutes,
      input.practicedMinutesToday,
      input.gamesWon,
    ],
  );
}
