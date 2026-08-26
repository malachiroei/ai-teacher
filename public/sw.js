const REMINDER_CACHE = "buddyai-reminder";
const REMINDER_URL = "/__buddyai/reminder-config";
const DB_NAME = "buddyai-reminders";
const STORE = "config";
const LOCAL_TAG = "daily-practice-reminder";
const WATCH_SLICE_MS = 25000;

let alarmWatchToken = 0;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(async () => {
      const config = await loadConfig();
      if (config?.enabled && Number(config.nextFireAt) > Date.now()) {
        await startAlarmWatch({
          targetTimestamp: Number(config.nextFireAt),
          preferredTime: config.hhmm,
          title: titleFor(config),
          body: bodyFor(config),
          icon: iconFor(config),
          tag: LOCAL_TAG,
          config,
        });
      }
    }),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SAVE_REMINDER" || data.type === "SCHEDULE_REMINDER") {
    event.waitUntil(saveConfig(data.config));
  }
  if (data.type === "SCHEDULE_LOCAL_ALARM") {
    event.waitUntil(
      (async () => {
        const targetTimestamp = Number(data.targetTimestamp);
        if (!Number.isFinite(targetTimestamp) || targetTimestamp <= Date.now()) {
          // Never fire immediately on schedule — roll to next day from preferredTime.
          const preferredTime = String(data.preferredTime || data.config?.hhmm || "17:00");
          const rolled = nextTimestamp(preferredTime);
          const nextConfig = {
            ...(data.config || {}),
            hhmm: preferredTime,
            enabled: true,
            nextFireAt: rolled,
          };
          await saveConfig(nextConfig);
          await startAlarmWatch({
            ...data,
            targetTimestamp: rolled,
            preferredTime,
            config: nextConfig,
          });
          return;
        }
        const nextConfig = {
          ...(data.config || {}),
          hhmm: data.preferredTime || data.config?.hhmm,
          enabled: true,
          nextFireAt: targetTimestamp,
        };
        await saveConfig(nextConfig);
        await startAlarmWatch({ ...data, config: nextConfig });
      })(),
    );
  }
  if (data.type === "CANCEL_LOCAL_ALARM") {
    alarmWatchToken += 1;
    event.waitUntil(
      (async () => {
        const config = await loadConfig();
        if (config) await saveConfig({ ...config, enabled: false });
        await clearLocalNotifications();
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || "🚀 Alex is waiting for you!";
  const options = {
    body: data.body || "Ready for today's quick English practice?",
    icon: data.icon || "/icon-192.png",
    badge: data.badge || "/icon-192.png",
    vibrate: [200, 100, 200],
    data: { url: data.url || "/" },
    tag: data.tag || "buddyai-daily-practice",
    renotify: true,
  };
  event.waitUntil(self.registration.showNotification(title, options));
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
  if (!config) return;
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
    /* fall through */
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
  const [rawHour, rawMinute] = String(hhmm || "17:00").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  return {
    hour: Number.isFinite(hour) ? hour : 17,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function nextTimestamp(hhmm, from = new Date()) {
  const { hour, minute } = parseHhmm(hhmm);
  const next = new Date(from);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function titleFor(config) {
  const tutor = String(config?.tutorName || "Alex").trim() || "Alex";
  return `🚀 ${tutor} is waiting for you!`;
}

function bodyFor(config) {
  const name = String(config?.kidName || "champ").trim() || "champ";
  const minutes = Math.max(5, Number(config?.goalMinutes) || 10);
  return `Hey ${name}! Ready for today's quick ${minutes}-min English challenge?`;
}

function iconFor(config) {
  const tutorId = String(config?.tutorId || "emma").trim() || "emma";
  return `/avatars/${tutorId}.png`;
}

async function clearLocalNotifications() {
  try {
    const existing = await self.registration.getNotifications({ tag: LOCAL_TAG, includeTriggered: true });
    await Promise.all(existing.map((item) => item.close()));
  } catch {
    try {
      const existing = await self.registration.getNotifications({ tag: LOCAL_TAG });
      await Promise.all(existing.map((item) => item.close()));
    } catch {
      /* ignore */
    }
  }
}

async function fireLocalNotification(payload) {
  if (!self.registration?.showNotification) return;
  const title = payload.title || "🚀 Alex is waiting for you!";
  const icon = payload.icon || "/icon-192.png";
  await self.registration.showNotification(title, {
    body: payload.body || "Ready for today's quick English practice?",
    icon,
    badge: icon,
    tag: payload.tag || LOCAL_TAG,
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: "/", preferredTime: payload.preferredTime },
  });
}

async function startAlarmWatch(payload) {
  const token = ++alarmWatchToken;
  let target = Number(payload.targetTimestamp);
  if (!Number.isFinite(target)) return;

  while (token === alarmWatchToken) {
    const remaining = target - Date.now();
    if (remaining <= 0) {
      const latest = (await loadConfig()) || payload.config || {};
      if (!latest.enabled) return;
      const day = todayKey();
      if (latest.lastFiredDate === day) {
        target = nextTimestamp(payload.preferredTime || latest.hhmm || "17:00");
        await saveConfig({ ...latest, nextFireAt: target });
        continue;
      }
      await fireLocalNotification({
        title: payload.title || titleFor(latest),
        body: payload.body || bodyFor(latest),
        icon: payload.icon || iconFor(latest),
        tag: payload.tag || LOCAL_TAG,
        preferredTime: payload.preferredTime || latest.hhmm,
      });
      target = nextTimestamp(payload.preferredTime || latest.hhmm || "17:00");
      await saveConfig({ ...latest, enabled: true, lastFiredDate: day, nextFireAt: target });
      continue;
    }

    const slice = Math.min(Math.max(1000, remaining), WATCH_SLICE_MS);
    await new Promise((resolve) => setTimeout(resolve, slice));
    if (token !== alarmWatchToken) return;
  }
}
