"use client";

import { useEffect } from "react";

const SW_PATH = "/sw.js?v=6";
const SW_VERSION = "v6-2026-08-26";

export type NotificationPermissionResult = NotificationPermission | "unsupported";

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/", updateViaCache: "none" });
    try {
      void registration.update();
    } catch {
      /* ignore */
    }
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    await navigator.serviceWorker.ready;
    return registration;
  } catch (error) {
    console.warn("Service worker registration failed:", error);
    return null;
  }
}

/** Request permission only — never shows a notification. */
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
export const REMINDER_ENABLED_KEY = "buddyai_notifications_enabled";
export const REMINDER_CACHE_NAME = "buddyai-reminder";
export const REMINDER_CONFIG_URL = "/__buddyai/reminder-config";
export const LAST_REMINDER_DATE_KEY = "buddyai_last_reminder_date";
export const LOCAL_REMINDER_TAG = "daily-practice-reminder";

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

/** Next occurrence strictly in the future (same minute → tomorrow). Never "now". */
export function nextReminderTimestamp(hhmm: string, from = new Date()) {
  const [rawHour, rawMinute] = String(hhmm || "19:00").split(":");
  const hours = Number(rawHour);
  const minutes = Number(rawMinute);
  const target = new Date(from);
  target.setHours(Number.isFinite(hours) ? hours : 19, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  if (target.getTime() <= from.getTime()) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function postAlarmTimeToServiceWorker(config: ReminderScheduleConfig) {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const payload = {
    type: "SET_ALARM_TIME",
    preferredTime: config.hhmm,
    enabled: Boolean(config.enabled),
    tutorName: config.tutorName,
    tutorId: config.tutorId,
    kidName: config.kidName,
    goalMinutes: config.goalMinutes,
    lastFiredDate: config.lastFiredDate || "",
    nextFireAt: config.nextFireAt ?? nextReminderTimestamp(config.hhmm),
  };
  const send = (worker: ServiceWorker | null | undefined) => {
    worker?.postMessage(payload);
  };
  if (navigator.serviceWorker.controller) {
    send(navigator.serviceWorker.controller);
    return;
  }
  void navigator.serviceWorker.ready.then((registration) => {
    send(registration.active ?? registration.waiting ?? registration.installing);
  });
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

async function syncWebPushSubscription(config: ReminderScheduleConfig): Promise<{ ok: boolean; error?: string }> {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  if (!publicKey) {
    return { ok: false, error: "חסר NEXT_PUBLIC_VAPID_PUBLIC_KEY בבילד" };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, error: "הדפדפן לא תומך ב-Web Push (נסי Chrome)" };
  }
  if (Notification.permission !== "granted") {
    return { ok: false, error: "לא ניתנה הרשאת התראות" };
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    // Ensure this page is controlled (needed on Android after first install).
    if (!navigator.serviceWorker.controller) {
      await registration.update();
    }

    if (!config.enabled) {
      const existing = await registration.pushManager.getSubscription();
      await fetch("/api/notifications/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          subscription: existing?.toJSON?.() ?? existing,
          preferredTime: config.hhmm,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem",
          enabled: false,
        }),
      });
      return { ok: true };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
    }

    const response = await fetch("/api/notifications/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        preferredTime: config.hhmm,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jerusalem",
        enabled: true,
        tutorName: config.tutorName,
        kidName: config.kidName,
        goalMinutes: config.goalMinutes,
      }),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    if (!response.ok) {
      return { ok: false, error: data.error || `Subscribe failed (${response.status})` };
    }
    return { ok: true };
  } catch (error) {
    console.warn("Could not sync web push subscription:", error);
    return { ok: false, error: error instanceof Error ? error.message : "Push subscribe failed" };
  }
}

/** Explicit test button — server push, with local SW fallback so the phone always gets a ping. */
export async function sendServerTestPush(input: {
  preferredTime: string;
  tutorName: string;
  tutorId?: string;
  kidName?: string;
  goalMinutes?: number;
}) {
  if (typeof window === "undefined") return { ok: false, error: "Unavailable" };
  const permission = await requestNotificationPermission();
  if (permission !== "granted") {
    return { ok: false, error: permission === "denied" ? NOTIFICATION_DENIED_HELP : "Notifications are not available." };
  }

  const config: ReminderScheduleConfig = {
    hhmm: input.preferredTime,
    enabled: true,
    tutorName: input.tutorName,
    tutorId: input.tutorId || "emma",
    kidName: input.kidName || "",
    goalMinutes: input.goalMinutes ?? 10,
  };

  const synced = await syncWebPushSubscription(config);
  if (!synced.ok) {
    // Still try a local notification so the user sees something while fixing server setup.
    const localOk = await showLocalTestNotification(config);
    return {
      ok: localOk,
      error: localOk
        ? undefined
        : synced.error || "Could not save push subscription",
      localOnly: localOk,
    };
  }

  try {
    const response = await fetch("/api/notifications/test-push", {
      method: "POST",
      credentials: "same-origin",
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; sent?: number };
    if (response.ok && data.ok) {
      return { ok: true, sent: data.sent ?? 1 };
    }
    // Server push failed — fall back to local so the test button still proves permission works.
    const localOk = await showLocalTestNotification(config);
    if (localOk) {
      return {
        ok: true,
        localOnly: true,
        error: data.error || "Server push failed; showed a local test notification instead.",
      };
    }
    return { ok: false, error: data.error || "Test push failed." };
  } catch (error) {
    const localOk = await showLocalTestNotification(config);
    if (localOk) return { ok: true, localOnly: true };
    return { ok: false, error: error instanceof Error ? error.message : "Test push failed." };
  }
}

/** Only used by the explicit test button — never by bell toggle. */
async function showLocalTestNotification(config: ReminderScheduleConfig) {
  try {
    const registration = await navigator.serviceWorker.ready;
    const tutor = config.tutorName.trim() || "Alex";
    const name = config.kidName.trim() || "champ";
    const icon = `/avatars/${config.tutorId || "emma"}.png`;
    await registration.showNotification(`🚀 ${tutor} is waiting for you!`, {
      body: `Hey ${name}! Test notification — if you see this, permission works.`,
      icon,
      badge: "/icon-192.png",
      tag: "buddyai-notify-test",
      data: { url: "/" },
      ...({ renotify: true, vibrate: [200, 100, 200] } as NotificationOptions),
    });
    void playReminderSound();
    return true;
  } catch (error) {
    console.warn("Local test notification failed:", error);
    return false;
  }
}

/**
 * Persist schedule + tell the SW. Never calls showNotification.
 * Also syncs Web Push (awaited) so locked-phone cron can deliver.
 */
export async function persistReminderSchedule(config: ReminderScheduleConfig) {
  if (typeof window === "undefined") return;
  const withTarget = { ...config, nextFireAt: nextReminderTimestamp(config.hhmm) };
  try {
    window.localStorage.setItem(REMINDER_SCHEDULE_STORAGE_KEY, JSON.stringify(withTarget));
    window.localStorage.setItem(REMINDER_ENABLED_KEY, withTarget.enabled ? "true" : "false");
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
  await registerServiceWorker();
  postAlarmTimeToServiceWorker(withTarget);
  const sync = await syncWebPushSubscription(withTarget);
  if (!sync.ok && withTarget.enabled) {
    console.warn("[reminders] push subscribe failed:", sync.error);
  }
  armPageAlarm(withTarget);
}

let pageAlarmTimer: number | null = null;

/** Fires while the PWA/tab is alive (Android kills SW timers when the screen is off). */
function armPageAlarm(config: ReminderScheduleConfig) {
  if (typeof window === "undefined") return;
  if (pageAlarmTimer != null) {
    window.clearTimeout(pageAlarmTimer);
    pageAlarmTimer = null;
  }
  if (!config.enabled || Notification.permission !== "granted") return;
  const when = config.nextFireAt && config.nextFireAt > Date.now() ? config.nextFireAt : nextReminderTimestamp(config.hhmm);
  const delay = when - Date.now();
  if (delay < 5_000) return; // never near-instant from toggle
  pageAlarmTimer = window.setTimeout(() => {
    void (async () => {
      const latest = readStoredReminderSchedule();
      if (!latest?.enabled) return;
      const today = localDateKey();
      if (latest.lastFiredDate === today) {
        armPageAlarm({ ...latest, nextFireAt: nextReminderTimestamp(latest.hhmm) });
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const tutor = latest.tutorName.trim() || "Alex";
        const name = latest.kidName.trim() || "champ";
        const icon = `/avatars/${latest.tutorId || "emma"}.png`;
        await registration.showNotification(`🚀 ${tutor} is waiting for you!`, {
          body: `Hey ${name}! Ready for today's quick ${Math.max(5, latest.goalMinutes || 10)}-min English challenge?`,
          icon,
          badge: "/icon-192.png",
          tag: LOCAL_REMINDER_TAG,
          data: { url: "/" },
          ...({ renotify: true, vibrate: [200, 100, 200] } as NotificationOptions),
        });
        await markReminderFiredToday();
      } catch (error) {
        console.warn("Page alarm notification failed:", error);
      }
    })();
  }, delay);
}

export async function markReminderFiredToday() {
  const previous = readStoredReminderSchedule();
  if (!previous) return;
  const todayStr = localDateKey();
  try {
    window.localStorage.setItem(LAST_REMINDER_DATE_KEY, todayStr);
  } catch {
    /* ignore */
  }
  const next = { ...previous, lastFiredDate: todayStr, nextFireAt: nextReminderTimestamp(previous.hhmm) };
  try {
    window.localStorage.setItem(REMINDER_SCHEDULE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    await writeReminderIndexedDb(next);
  } catch {
    /* ignore */
  }
  postAlarmTimeToServiceWorker(next);
}

export function useNotifications() {
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data || {};
      if (data.type !== "SW_UPDATED" || data.version !== SW_VERSION) return;
      try {
        const key = `buddyai_sw_reloaded:${SW_VERSION}`;
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        /* ignore */
      }
      window.location.reload();
    };
    navigator.serviceWorker?.addEventListener("message", onMessage);

    void (async () => {
      await registerServiceWorker();
      const stored = readStoredReminderSchedule();
      if (!stored) return;
      const next = {
        ...stored,
        nextFireAt:
          stored.nextFireAt && stored.nextFireAt > Date.now()
            ? stored.nextFireAt
            : nextReminderTimestamp(stored.hhmm),
      };
      // Restore alarm only — never show a notification on mount.
      postAlarmTimeToServiceWorker(next);
      if (stored.enabled) {
        void syncWebPushSubscription(next);
        armPageAlarm(next);
      }
    })();

    return () => {
      navigator.serviceWorker?.removeEventListener("message", onMessage);
    };
  }, []);
}
