import webPush from "web-push";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  icon?: string;
};

export function vapidConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim(),
  );
}

export function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || "";
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim() || "";
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:hello@buddyai.app";
  if (!publicKey || !privateKey) {
    throw new Error("Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY or VAPID_PRIVATE_KEY");
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  return webPush;
}

export function clockInTimeZone(timeZone: string, from = new Date()) {
  const tz = timeZone.trim() || "UTC";
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hourCycle: "h23",
    }).formatToParts(from);
    const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
    return {
      hhmm: `${get("hour")}:${get("minute")}`,
      dateKey: `${get("year")}-${get("month")}-${get("day")}`,
    };
  } catch {
    const hours = String(from.getUTCHours()).padStart(2, "0");
    const minutes = String(from.getUTCMinutes()).padStart(2, "0");
    return { hhmm: `${hours}:${minutes}`, dateKey: from.toISOString().slice(0, 10) };
  }
}

export function normalizePreferredTime(hhmm: string) {
  const [rawHour, rawMinute] = String(hhmm || "17:00").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 17;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}
