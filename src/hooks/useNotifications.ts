"use client";

import { useEffect } from "react";

const SW_PATH = "/sw.js";

export type NotificationPermissionResult = NotificationPermission | "unsupported";

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/", updateViaCache: "none" });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.warn("Service worker registration failed:", error);
    return null;
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionResult> {
  if (typeof window === "undefined" || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "granted") {
    await registerServiceWorker();
    return "granted";
  }
  if (Notification.permission === "denied") return "denied";
  const result = await Notification.requestPermission();
  if (result === "granted") await registerServiceWorker();
  return result;
}

function pickBody(kidName: string, tutorName: string, goalMinutes: number) {
  const name = kidName.trim() || "friend";
  const minutes = Math.max(5, goalMinutes || 10);
  const options = [
    `Hey ${name}! 🎮 Ready for today's quick ${minutes}-min challenge? Let's talk!`,
    `⭐ Your streak is on the line! Jump in for a fun chat with ${tutorName}!`,
    `🎯 We have an exciting new story today! Tap here to start.`,
  ];
  return options[Math.floor(Math.random() * options.length)];
}

export function formatPracticeTimeLabel(hhmm: string) {
  const [rawHour, rawMinute] = String(hhmm || "17:00").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const safeHour = Number.isFinite(hour) ? hour : 17;
  const safeMinute = Number.isFinite(minute) ? minute : 0;
  const period = safeHour >= 12 ? "PM" : "AM";
  const hour12 = safeHour % 12 || 12;
  return `${String(hour12).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")} ${period}`;
}

export const NOTIFICATION_DENIED_HELP =
  "Notifications are blocked for this site. Open your browser site settings, allow Notifications, then try again. / ההתראות חסומות. אפשר התראות בהגדרות האתר בדפדפן, ואז נסה שוב.";

export type ReminderSoundId = "chime" | "arcade" | "pop" | "fanfare";
export const REMINDER_SOUND_STORAGE_KEY = "buddyai_reminder_sound";
export const REMINDER_SCHEDULE_STORAGE_KEY = "buddyai_reminder_schedule";
export const REMINDER_CACHE_NAME = "buddyai-reminder";
export const REMINDER_CONFIG_URL = "/__buddyai/reminder-config";

export const REMINDER_SOUNDS: Array<{
  id: ReminderSoundId;
  emoji: string;
  label: string;
  labelHe: string;
}> = [
  { id: "chime", emoji: "🔔", label: "Chime", labelHe: "פעמון קסם" },
  { id: "arcade", emoji: "🎮", label: "Arcade", labelHe: "משחק רטרו" },
  { id: "pop", emoji: "🫧", label: "Pop", labelHe: "פופ עליז" },
  { id: "fanfare", emoji: "🎺", label: "Hero Fanfare", labelHe: "תרועת ניצחון" },
];

const SOUND_IDS = new Set<ReminderSoundId>(REMINDER_SOUNDS.map((item) => item.id));

export function readReminderSound(): ReminderSoundId {
  if (typeof window === "undefined") return "chime";
  try {
    const value = window.localStorage.getItem(REMINDER_SOUND_STORAGE_KEY);
    if (value && SOUND_IDS.has(value as ReminderSoundId)) return value as ReminderSoundId;
  } catch {
    /* ignore */
  }
  return "chime";
}

export function writeReminderSound(soundId: ReminderSoundId) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMINDER_SOUND_STORAGE_KEY, soundId);
  } catch {
    /* ignore */
  }
}

let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx || audioCtx.state === "closed") audioCtx = new Ctor();
  return audioCtx;
}

function tone(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  when: number,
  duration: number,
  peak = 0.16,
  endFreq?: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), when + duration);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(peak, when + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + duration + 0.03);
}

function playChime(ctx: AudioContext, t0: number) {
  [523.25, 659.25, 783.99].forEach((freq, index) => {
    tone(ctx, "sine", freq, t0 + index * 0.12, 0.55, 0.14);
    tone(ctx, "sine", freq * 2, t0 + index * 0.12, 0.35, 0.04);
  });
}

function playArcade(ctx: AudioContext, t0: number) {
  [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
    tone(ctx, "square", freq, t0 + index * 0.09, 0.1, 0.07);
  });
}

function playPop(ctx: AudioContext, t0: number) {
  tone(ctx, "sine", 980, t0, 0.12, 0.2, 420);
  tone(ctx, "sine", 1320, t0 + 0.1, 0.08, 0.12, 700);
}

function playFanfare(ctx: AudioContext, t0: number) {
  [392, 523.25, 783.99].forEach((freq, index) => {
    tone(ctx, "triangle", freq, t0 + index * 0.14, 0.22, 0.15);
    tone(ctx, "square", freq, t0 + index * 0.14, 0.18, 0.03);
  });
}

function playTryAgain(ctx: AudioContext, t0: number) {
  tone(ctx, "sine", 220, t0, 0.12, 0.15, 140);
  tone(ctx, "sine", 200, t0 + 0.09, 0.11, 0.1, 130);
}

export async function playGameSfx(kind: "bubble" | "lock" | "bounce" | "win" | "sparkle") {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    if (kind === "bubble") {
      tone(ctx, "sine", 620, t0, 0.09, 0.12, 980);
      tone(ctx, "sine", 980, t0 + 0.04, 0.08, 0.08, 1400);
    } else if (kind === "lock") {
      tone(ctx, "triangle", 740, t0, 0.07, 0.12);
      tone(ctx, "sine", 1180, t0 + 0.05, 0.12, 0.08);
    } else if (kind === "bounce") {
      tone(ctx, "sine", 260, t0, 0.1, 0.1, 180);
    } else if (kind === "sparkle") {
      [880, 1174, 1568].forEach((freq, index) => {
        tone(ctx, "sine", freq, t0 + index * 0.05, 0.16, 0.08);
      });
    } else {
      [523.25, 659.25, 783.99, 1046.5].forEach((freq, index) => {
        tone(ctx, "triangle", freq, t0 + index * 0.08, 0.22, 0.12);
      });
    }
    return true;
  } catch {
    return false;
  }
}

export async function playTryAgainSound() {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    playTryAgain(ctx, ctx.currentTime + 0.01);
    return true;
  } catch {
    return false;
  }
}

export async function playReminderSound(soundId?: ReminderSoundId) {
  const ctx = getAudioContext();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const id = soundId && SOUND_IDS.has(soundId) ? soundId : readReminderSound();
    const t0 = ctx.currentTime + 0.02;
    if (id === "arcade") playArcade(ctx, t0);
    else if (id === "pop") playPop(ctx, t0);
    else if (id === "fanfare") playFanfare(ctx, t0);
    else playChime(ctx, t0);
    return true;
  } catch (error) {
    console.warn("Could not play reminder sound:", error);
    return false;
  }
}

async function showViaServiceWorker(title: string, options: NotificationOptions & Record<string, unknown>) {
  const registration = (await registerServiceWorker()) ?? (await navigator.serviceWorker?.ready.catch(() => null));
  if (registration?.showNotification) {
    await registration.showNotification(title, options);
    return true;
  }
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, options);
    return true;
  }
  return false;
}

export async function showTutorPracticeNotification(input: {
  tutorName: string;
  tutorId: string;
  kidName?: string;
  goalMinutes?: number;
  tag?: string;
}) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }
  const tutorName = input.tutorName.trim() || "BuddyAI";
  const tutorId = input.tutorId.trim() || "emma";
  const icon = `/avatars/${tutorId}.png`;
  try {
    void playReminderSound();
    const shown = await showViaServiceWorker(`🚀 ${tutorName} is waiting for you!`, {
      body: pickBody(input.kidName ?? "", tutorName, input.goalMinutes ?? 10),
      icon,
      badge: icon,
      tag: input.tag ?? "buddyai-daily-practice",
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: "/" },
    });
    if (shown) void markReminderFiredToday();
    return shown;
  } catch (error) {
    console.warn("Could not show practice notification:", error);
    return false;
  }
}

export async function showNotificationsEnabledTest(input: {
  tutorName: string;
  tutorId: string;
  practiceTime: string;
}) {
  if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") {
    return false;
  }
  const tutorName = input.tutorName.trim() || "BuddyAI";
  const tutorId = input.tutorId.trim() || "emma";
  const when = formatPracticeTimeLabel(input.practiceTime);
  const icon = `/avatars/${tutorId}.png`;
  try {
    void playReminderSound();
    return await showViaServiceWorker(`🎉 Notifications enabled! ${tutorName} will ping you at ${when}`, {
      body: "Tap here to open BuddyAI and start talking.",
      icon,
      badge: icon,
      tag: "buddyai-notify-test",
      data: { url: "/" },
      ...({ vibrate: [200, 100, 200] } as NotificationOptions),
    });
  } catch (error) {
    console.warn("Could not show test notification:", error);
    return false;
  }
}

export interface ReminderScheduleConfig {
  hhmm: string;
  enabled: boolean;
  tutorName: string;
  tutorId: string;
  kidName: string;
  goalMinutes: number;
  lastFiredDate?: string;
  nextFireAt?: number;
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function readStoredReminderSchedule(): ReminderScheduleConfig | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(REMINDER_SCHEDULE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ReminderScheduleConfig;
  } catch {
    return null;
  }
}

async function writeReminderIndexedDb(config: ReminderScheduleConfig) {
  await new Promise<void>((resolve) => {
    const request = indexedDB.open("buddyai-reminders", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("config")) request.result.createObjectStore("config");
    };
    request.onerror = () => resolve();
    request.onsuccess = () => {
      try {
        const tx = request.result.transaction("config", "readwrite");
        tx.objectStore("config").put(config, "schedule");
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    };
  });
}

export const LAST_REMINDER_DATE_KEY = "buddyai_last_reminder_date";

export function nextReminderTimestamp(hhmm: string, from = new Date()) {
  const [rawHour, rawMinute] = String(hhmm || "19:00").split(":");
  const hours = Number(rawHour);
  const minutes = Number(rawMinute);
  const target = new Date(from);
  target.setHours(Number.isFinite(hours) ? hours : 19, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (target.getTime() <= from.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime();
}

let pageAlarmTimer: number | null = null;

function readLastAlertDate() {
  try {
    return window.localStorage.getItem(LAST_REMINDER_DATE_KEY) || "";
  } catch {
    return "";
  }
}

function writeLastAlertDate(day: string) {
  try {
    window.localStorage.setItem(LAST_REMINDER_DATE_KEY, day);
  } catch {
    /* ignore */
  }
}

function armPageReminderAlarm(config: ReminderScheduleConfig) {
  if (typeof window === "undefined") return;
  if (pageAlarmTimer != null) {
    window.clearTimeout(pageAlarmTimer);
    pageAlarmTimer = null;
  }
  if (!config.enabled) return;
  const when = nextReminderTimestamp(config.hhmm);
  const delayMs = when - Date.now();
  if (delayMs <= 0) return;
  pageAlarmTimer = window.setTimeout(() => {
    void (async () => {
      const latest = readStoredReminderSchedule();
      if (!latest?.enabled) return;
      const todayStr = localDateKey();
      if (readLastAlertDate() === todayStr || latest.lastFiredDate === todayStr) {
        armPageReminderAlarm(latest);
        return;
      }
      writeLastAlertDate(todayStr);
      await showTutorPracticeNotification({
        tutorName: latest.tutorName,
        tutorId: latest.tutorId,
        kidName: latest.kidName,
        goalMinutes: latest.goalMinutes,
      });
      await markReminderFiredToday();
      const again = readStoredReminderSchedule();
      if (again) armPageReminderAlarm(again);
    })();
  }, delayMs);
}

export async function persistReminderSchedule(config: ReminderScheduleConfig) {
  if (typeof window === "undefined") return;
  const withTarget = { ...config, nextFireAt: nextReminderTimestamp(config.hhmm) };
  try {
    window.localStorage.setItem(REMINDER_SCHEDULE_STORAGE_KEY, JSON.stringify(withTarget));
  } catch {
    /* ignore */
  }
  try {
    const cache = await caches.open(REMINDER_CACHE_NAME);
    await cache.put(
      REMINDER_CONFIG_URL,
      new Response(JSON.stringify(withTarget), { headers: { "Content-Type": "application/json" } }),
    );
  } catch {
    /* ignore */
  }
  try {
    await writeReminderIndexedDb(withTarget);
  } catch {
    /* ignore */
  }
  const registration = await registerServiceWorker();
  const worker = registration?.active ?? registration?.waiting ?? registration?.installing;
  worker?.postMessage({ type: "SAVE_REMINDER", config: withTarget });
  armPageReminderAlarm(withTarget);
}

export async function markReminderFiredToday() {
  const previous = readStoredReminderSchedule();
  if (!previous) return;
  const todayStr = localDateKey();
  writeLastAlertDate(todayStr);
  await persistReminderSchedule({ ...previous, lastFiredDate: todayStr });
}

export function useNotifications() {
  useEffect(() => {
    void registerServiceWorker();
    const stored = readStoredReminderSchedule();
    if (stored?.enabled) armPageReminderAlarm(stored);
  }, []);
}
