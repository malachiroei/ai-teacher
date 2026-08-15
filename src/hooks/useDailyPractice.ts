"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { savePracticeProgress } from "@/lib/chat-history";
import {
  alreadyNotifiedToday,
  loadPracticeSnapshot,
  mergePracticeSeconds,
  msUntilTime,
  practicedMinutes,
  savePracticeSnapshot,
  showPracticeNotification,
  todayDateKey,
} from "@/lib/practice";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/supabase/types";

export function useDailyPractice(options: {
  userId: string | null;
  enabled: boolean;
  profile: Profile | null;
  goalMinutes: number;
  reminderTime: string;
  remindersEnabled: boolean;
  characterName: string;
}) {
  const { userId, enabled, profile, goalMinutes, reminderTime, remindersEnabled, characterName } = options;
  const [seconds, setSeconds] = useState(0);
  const [celebrated, setCelebrated] = useState(false);
  const [celebrationOpen, setCelebrationOpen] = useState(false);
  const secondsRef = useRef(0);
  const celebratedRef = useRef(false);
  const hydratedUser = useRef<string | null>(null);

  useEffect(() => {
    if (!userId) {
      hydratedUser.current = null;
      setSeconds(0);
      setCelebrated(false);
      setCelebrationOpen(false);
      secondsRef.current = 0;
      celebratedRef.current = false;
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
    setSeconds(merged);
    setCelebrated(celebrated);
  }, [userId, profile?.id, profile?.practice_date, profile?.practice_seconds]);

  const persist = useCallback(
    (nextSeconds: number, nextCelebrated: boolean, syncRemote: boolean) => {
      if (!userId) return;
      const snapshot = { date: todayDateKey(), seconds: nextSeconds, celebrated: nextCelebrated };
      savePracticeSnapshot(userId, snapshot);
      if (!syncRemote) return;
      void savePracticeProgress(createClient(), userId, {
        practice_date: snapshot.date,
        practice_seconds: nextSeconds,
      });
    },
    [userId],
  );

  useEffect(() => {
    if (!enabled || !userId) return;

    let lastSync = Date.now();
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const previous = secondsRef.current;
      const next = previous + 1;
      secondsRef.current = next;

      const goalSeconds = Math.max(1, goalMinutes) * 60;
      const crossedMinute = Math.floor(next / 60) !== Math.floor(previous / 60);
      const justReached = !celebratedRef.current && next >= goalSeconds;

      if (crossedMinute || justReached) setSeconds(next);

      if (justReached) {
        celebratedRef.current = true;
        setCelebrated(true);
        setCelebrationOpen(true);
        persist(next, true, true);
        return;
      }

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
  }, [enabled, userId, goalMinutes, persist]);

  useEffect(() => {
    if (!remindersEnabled || !enabled) return;
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;

    const fireIfDue = () => {
      if (alreadyNotifiedToday()) return;
      if (practicedMinutes(secondsRef.current) >= goalMinutes) return;
      const [hours, minutes] = reminderTime.split(":").map(Number);
      const now = new Date();
      if (now.getHours() === hours && now.getMinutes() === minutes) {
        showPracticeNotification(characterName);
      }
    };

    fireIfDue();
    const delay = msUntilTime(reminderTime);
    const timeout = window.setTimeout(() => {
      if (practicedMinutes(secondsRef.current) < goalMinutes) {
        showPracticeNotification(characterName);
      }
    }, delay);
    const poll = window.setInterval(fireIfDue, 30000);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(poll);
    };
  }, [remindersEnabled, enabled, reminderTime, characterName, goalMinutes]);

  const dismissCelebration = useCallback(() => setCelebrationOpen(false), []);

  return {
    seconds,
    minutes: practicedMinutes(seconds),
    celebrated,
    celebrationOpen,
    dismissCelebration,
  };
}
