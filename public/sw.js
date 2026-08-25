const REMINDER_CACHE = "buddyai-reminder";
const REMINDER_URL = "/__buddyai/reminder-config";
const REMINDER_TAG = "buddyai-daily-practice";
const DB_NAME = "buddyai-reminders";
const STORE = "config";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(() => maybeFireMissedReminder()),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SCHEDULE_REMINDER") {
    event.waitUntil(saveAndSchedule(data.config));
  }
  if (data.type === "CHECK_REMINDER") {
    event.waitUntil(maybeFireMissedReminder());
  }
});

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "practice-reminder") {
    event.waitUntil(maybeFireMissedReminder());
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag === "practice-reminder") {
    event.waitUntil(maybeFireMissedReminder());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      return undefined;
    }),
  );
});

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveConfig(config) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(config, "schedule");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* IndexedDB may be blocked */
  }
  try {
    const cache = await caches.open(REMINDER_CACHE);
    await cache.put(
      REMINDER_URL,
      new Response(JSON.stringify(config), { headers: { "Content-Type": "application/json" } }),
    );
  } catch {
    /* cache may be unavailable */
  }
}

async function loadConfig() {
  try {
    const db = await openDb();
    const fromDb = await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const request = tx.objectStore(STORE).get("schedule");
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
    if (fromDb) return fromDb;
  } catch {
    /* fall through to cache */
  }
  try {
    const cache = await caches.open(REMINDER_CACHE);
    const response = await cache.match(REMINDER_URL);
    if (response) return response.json();
  } catch {
    /* ignore */
  }
  return null;
}

function parseHhmm(hhmm) {
  const [rawHour, rawMinute] = String(hhmm || "19:00").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  return {
    hour: Number.isFinite(hour) ? hour : 19,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function nextTimestamp(hhmm, from = new Date()) {
  const { hour, minute } = parseHhmm(hhmm);
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function isDueToday(hhmm, from = new Date()) {
  const { hour, minute } = parseHhmm(hhmm);
  const minutesNow = from.getHours() * 60 + from.getMinutes();
  return minutesNow >= hour * 60 + minute;
}

async function saveAndSchedule(config) {
  if (!config) return;
  const nextFireAt = nextTimestamp(config.hhmm);
  const stored = { ...config, nextFireAt };
  await saveConfig(stored);
  if (!stored.enabled) return;
  await scheduleTrigger(stored);
  await maybeFireMissedReminder();
  await keepWatching(stored);
}

async function keepWatching(config) {
  const when = Number(config.nextFireAt) || nextTimestamp(config.hhmm);
  const delay = when - Date.now();
  if (delay <= 0) {
    await maybeFireMissedReminder();
    const latest = await loadConfig();
    if (latest?.enabled) await scheduleTrigger(latest);
    return;
  }
  const slice = Math.min(Math.max(1000, delay), 25000);
  await new Promise((resolve) => setTimeout(resolve, slice));
  const latest = await loadConfig();
  if (!latest?.enabled) return;
  if (Date.now() >= (Number(latest.nextFireAt) || nextTimestamp(latest.hhmm)) - 1500) {
    await maybeFireMissedReminder();
    await scheduleTrigger(latest);
    return;
  }
  await keepWatching(latest);
}

async function scheduleTrigger(config) {
  const when = Number(config.nextFireAt) || nextTimestamp(config.hhmm);
  const Trigger = self.TimestampTrigger;
  const canTrigger = typeof Trigger === "function" && "showTrigger" in Notification.prototype;
  if (!canTrigger || !self.registration?.showNotification) return;
  try {
    const existing = await self.registration.getNotifications({ tag: REMINDER_TAG, includeTriggered: true });
    await Promise.all(existing.map((item) => item.close()));
  } catch {
    try {
      const existing = await self.registration.getNotifications({ tag: REMINDER_TAG });
      await Promise.all(existing.map((item) => item.close()));
    } catch {
      /* ignore */
    }
  }
  try {
    await self.registration.showNotification(titleFor(config), {
      ...notificationOptions(config),
      showTrigger: new Trigger(when),
    });
  } catch (error) {
    console.warn("Could not schedule TimestampTrigger reminder:", error);
  }
}

function titleFor(config) {
  const tutor = String(config.tutorName || "BuddyAI").trim() || "BuddyAI";
  return `🚀 ${tutor} is waiting for you!`;
}

function notificationOptions(config) {
  const tutorId = String(config.tutorId || "emma").trim() || "emma";
  const icon = `/avatars/${tutorId}.png`;
  const name = String(config.kidName || "friend").trim() || "friend";
  const minutes = Math.max(5, Number(config.goalMinutes) || 10);
  const tutor = String(config.tutorName || "BuddyAI").trim() || "BuddyAI";
  return {
    body: `Hey ${name}! Ready for today's quick ${minutes}-min challenge with ${tutor}?`,
    icon,
    badge: icon,
    tag: REMINDER_TAG,
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: "/" },
  };
}

async function maybeFireMissedReminder() {
  const config = await loadConfig();
  if (!config?.enabled || !config.hhmm) return;
  const now = new Date();
  const key = todayKey(now);
  if (config.lastFiredDate === key) return;
  if (!isDueToday(config.hhmm, now)) {
    await scheduleTrigger(config);
    return;
  }
  if (!self.registration?.showNotification) return;
  try {
    await self.registration.showNotification(titleFor(config), notificationOptions(config));
    const nextFireAt = nextTimestamp(config.hhmm);
    await saveConfig({ ...config, lastFiredDate: key, nextFireAt });
    await scheduleTrigger({ ...config, lastFiredDate: key, nextFireAt });
  } catch (error) {
    console.warn("Could not show missed practice reminder:", error);
  }
}
