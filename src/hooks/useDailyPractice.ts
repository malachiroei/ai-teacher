"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { savePracticeProgress } from "@/lib/chat-history";
import {
  alreadyNotifiedToday,
  loadPracticeSnapshot,
  markNotifiedToday,
  mergePracticeSeconds,
  msUntilTime,
  practicedMinutes,
  savePracticeSnapshot,
  showPracticeNotification,
  todayDateKey,
} from "@/lib/practice";
import {
  persistReminderSchedule,
  pingReminderCheck,
  readStoredReminderSchedule,
} from "@/hooks/useNotifications";
import { recordWeekMinutes } from "@/lib/learning-progress";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

const IDLE_MS = 60_000;
const MIN_MESSAGES_FOR_GOAL = 2;

export function useDailyPractice(options: {
  userId: string | null;
  enabled: boolean;
  profile: Profile | null;
  goalMinutes: number;
  reminderTime: string;
  remindersEnabled: boolean;
  characterName: string;
  characterId?: string;
  kidName?: string;
  engaged?: boolean;
  lastUserMessageAt?: number;
  userMessageCount?: number;
}) {
  const {
    userId,
    enabled,
    profile,
    goalMinutes,
    reminderTime,
    remindersEnabled,
    characterName,
    characterId,
    kidName,
    engaged = false,
    lastUserMessageAt = 0,
    userMessageCount = 0,
  } = options;
  const [seconds, setSeconds] = useState(0);
  const [celebrated, setCelebrated] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const secondsRef = useRef(0);
  const celebratedRef = useRef(false);
  const pendingGoalRef = useRef(false);
  const hydratedUser = useRef<string | null>(null);
  const engagedRef = useRef(engaged);
  const lastUserMessageAtRef = useRef(lastUserMessageAt);
  const userMessageCountRef = useRef(userMessageCount);

  engagedRef.current = engaged;
  lastUserMessageAtRef.current = lastUserMessageAt;
  userMessageCountRef.current = userMessageCount;

  useEffect(() => {
    if (!userId) {
      hydratedUser.current = null;
      setSeconds(0);
      setCelebrated(false);
      setCelebrationOpen(false);
      secondsRef.current = 0;
      celebratedRef.current = false;
      pendingGoalRef.current = false;
      return;
    }

    const local = loadPracticeSnapshot(userId);
    const merged =
      hydratedUser.current === userId
        ? Math.max(secondsRef.current, mergePracticeSeconds(0, profile))
        : mergePracticeSeconds(local.seconds, profile);
    const celebrated = hydratedUser.current === userId ? celebratedRef.current : local.celebrated;
    hydratedUser.current = userId;

    const next = { date: todayDateKey(), seconds: merged, celebrated };
    savePracticeSnapshot(userId, next);
    secondsRef.current = merged;
    celebratedRef.current = celebrated;
    pendingGoalRef.current = !celebrated && merged >= Math.max(1, goalMinutes) * 60;
    setSeconds(merged);
    setCelebrated(celebrated);
  }, [userId, profile?.id, profile?.practice_date, profile?.practice_seconds, goalMinutes]);

  const persist = useCallback(
    (nextSeconds: number, nextCelebrated: boolean, syncRemote: boolean) => {
      if (!userId) return;
      const snapshot = { date: todayDateKey(), seconds: nextSeconds, celebrated: nextCelebrated };
      savePracticeSnapshot(userId, snapshot);
      recordWeekMinutes(userId, snapshot.date, practicedMinutes(nextSeconds));
      if (!syncRemote) return;
      void savePracticeProgress(createClient(), userId, {
        practice_date: snapshot.date,
        practice_seconds: nextSeconds,
      });
    },
    [userId],
  );

  const tryCelebrate = useCallback(
    (nextSeconds: number) => {
      if (celebratedRef.current) return;
      const goalSeconds = Math.max(1, goalMinutes) * 60;
      if (nextSeconds < goalSeconds && !pendingGoalRef.current) return;
      if (userMessageCountRef.current < MIN_MESSAGES_FOR_GOAL) {
        pendingGoalRef.current = nextSeconds >= goalSeconds;
        return;
      }
      celebratedRef.current = true;
      pendingGoalRef.current = false;
      setCelebrated(true);
      setCelebrationOpen(true);
      persist(nextSeconds, true, true);
    },
    [goalMinutes, persist],
  );

  useEffect(() => {
    if (!enabled || !userId) return;

    let lastSync = Date.now();
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const lastMessage = lastUserMessageAtRef.current;
      const recentlyMessaged = lastMessage > 0 && Date.now() - lastMessage < IDLE_MS;
      if (!engagedRef.current && !recentlyMessaged) return;

      const previous = secondsRef.current;
      const next = previous + 1;
      secondsRef.current = next;

      const goalSeconds = Math.max(1, goalMinutes) * 60;
      const crossedMinute = Math.floor(next / 60) !== Math.floor(previous / 60);
      const justReached = !celebratedRef.current && next >= goalSeconds;

      if (crossedMinute || justReached) setSeconds(next);
      if (justReached || pendingGoalRef.current) tryCelebrate(next);

      const shouldSync = Date.now() - lastSync >= 30000;
      if (shouldSync) {
        lastSync = Date.now();
        persist(next, celebratedRef.current, true);
      } else if (next % 5 === 0) {
        persist(next, celebratedRef.current, false);
      }
    };

    const interval = window.setInterval(tick, 1000);
    const onHide = () => persist(secondsRef.current, celebratedRef.current, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
      persist(secondsRef.current, celebratedRef.current, true);
    };
  }, [enabled, userId, goalMinutes, persist, tryCelebrate]);

  useEffect(() => {
    if (pendingGoalRef.current || (!celebratedRef.current && secondsRef.current >= Math.max(1, goalMinutes) * 60)) {
      tryCelebrate(secondsRef.current);
    }
  }, [userMessageCount, goalMinutes, tryCelebrate]);

  useEffect(() => {
    if (!remindersEnabled || !enabled) {
      void persistReminderSchedule({
        hhmm: reminderTime,
        enabled: false,
        tutorName: characterName,
        tutorId: characterId || "emma",
        kidName: kidName ?? "",
        goalMinutes,
        lastFiredDate: readStoredReminderSchedule()?.lastFiredDate,
      });
      return;
    }
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    function fireIfDue() {
      if (alreadyNotifiedToday()) return;
      if (practicedMinutes(secondsRef.current) >= goalMinutes) return;
      const [hours, minutes] = reminderTime.split(":").map(Number);
      const now = new Date();
      if (now.getHours() > hours || (now.getHours() === hours && now.getMinutes() >= minutes)) {
        void showPracticeNotification({
          tutorName: characterName,
          tutorId: characterId || "emma",
          kidName,
          goalMinutes,
        });
      }
    }

    const stored = readStoredReminderSchedule();
    void (async () => {
      try {
        const cache = await caches.open("buddyai-reminder");
        const response = await cache.match("/__buddyai/reminder-config");
        const fromSw = response ? ((await response.json()) as { lastFiredDate?: string }) : null;
        if (fromSw?.lastFiredDate === todayDateKey() || stored?.lastFiredDate === todayDateKey()) {
          markNotifiedToday();
        }
      } catch {
        if (stored?.lastFiredDate === todayDateKey()) markNotifiedToday();
      }
      fireIfDue();
    })();

    void persistReminderSchedule({
      hhmm: reminderTime,
      enabled: true,
      tutorName: characterName,
      tutorId: characterId || "emma",
      kidName: kidName ?? "",
      goalMinutes,
      lastFiredDate: alreadyNotifiedToday() ? todayDateKey() : stored?.lastFiredDate,
    });
    void pingReminderCheck();

    const delay = msUntilTime(reminderTime);
    const timeout = window.setTimeout(() => {
      if (practicedMinutes(secondsRef.current) < goalMinutes) {
        void showPracticeNotification({
          tutorName: characterName,
          tutorId: characterId || "emma",
          kidName,
          goalMinutes,
        });
      }
    }, delay);
    const poll = window.setInterval(fireIfDue, 30000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        fireIfDue();
        void pingReminderCheck();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [remindersEnabled, enabled, reminderTime, characterName, characterId, kidName, goalMinutes]);

  const dismissCelebration = useCallback(() => setCelebrationOpen(false), []);

  return {
    seconds,
    minutes: practicedMinutes(seconds),
    celebrated,
    celebrationOpen,
    dismissCelebration,
  };
}
