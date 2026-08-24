"use client";

import { useEffect } from "react";

const SW_PATH = "/sw.js";

export type NotificationPermissionResult = NotificationPermission | "unsupported";

export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(SW_PATH, { scope: "/" });
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
    return await showViaServiceWorker(`🚀 ${tutorName} is waiting for you!`, {
      body: pickBody(input.kidName ?? "", tutorName, input.goalMinutes ?? 10),
      icon,
      badge: icon,
      tag: input.tag ?? "buddyai-daily-practice",
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: "/" },
    });
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

export function useNotifications() {
  useEffect(() => {
    void registerServiceWorker();
  }, []);
}
