/* buddyai-sw alarm-v5 — grace period after arm; never fire on toggle */
const REMINDER_CACHE = "buddyai-reminder";
const REMINDER_URL = "/__buddyai/reminder-config";
const DB_NAME = "buddyai-reminders";
const STORE = "config";
const LOCAL_TAG = "daily-practice-reminder";
const CHECK_MS = 20000;
const WATCH_SLICE_MS = 30000;
/** After SET_ALARM_TIME, never fire for this long (prevents "bell → instant popup"). */
const ARM_GRACE_MS = 90_000;

let alarmState = {
  enabled: false,
  preferredTime: "17:00",
  lastFiredDate: "",
  nextFireAt: 0,
  tutorName: "Alex",
  tutorId: "emma",
  kidName: "champ",
  goalMinutes: 10,
};

let watchToken = 0;
let armedAt = 0;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(async () => {
      await clearPendingReminderNotifications();
      const config = await loadConfig();
      if (config) applyConfig(config, false);
      // Restore only — never showNotification on activate.
      if (alarmState.enabled) {
        armedAt = Date.now();
        armWatchdog();
      }
    }),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SET_ALARM_TIME" || data.type === "SAVE_REMINDER" || data.type === "SCHEDULE_REMINDER") {
    const config = data.type === "SET_ALARM_TIME" ? data : data.config || data;
    event.waitUntil(
      (async () => {
        await clearPendingReminderNotifications();
        applyConfig(config, true);
        armedAt = Date.now();
        await saveConfig(snapshot());
        // NEVER call showNotification here.
        if (alarmState.enabled) armWatchdog();
        else watchToken += 1;
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  // Server cron / explicit test-push only.
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

setInterval(() => {
  void checkAndFireAlarm();
}, CHECK_MS);

function applyConfig(config, recomputeNext) {
  if (!config) return;
  const preferred =
    config.preferredTime != null ? config.preferredTime : config.hhmm != null ? config.hhmm : alarmState.preferredTime;
  alarmState.enabled = Boolean(config.enabled);
  alarmState.preferredTime = normalizeHhmm(preferred || "17:00");
  if (config.lastFiredDate != null) alarmState.lastFiredDate = String(config.lastFiredDate || "");
  if (config.tutorName) alarmState.tutorName = String(config.tutorName);
  if (config.tutorId) alarmState.tutorId = String(config.tutorId);
  if (config.kidName != null) alarmState.kidName = String(config.kidName || "champ");
  if (config.goalMinutes != null) alarmState.goalMinutes = Number(config.goalMinutes) || 10;

  // Always schedule the next FUTURE occurrence (now/past → tomorrow).
  const incomingNext = Number(config.nextFireAt);
  if (recomputeNext || !Number.isFinite(incomingNext) || incomingNext <= Date.now()) {
    alarmState.nextFireAt = nextTimestamp(alarmState.preferredTime);
  } else {
    alarmState.nextFireAt = incomingNext;
  }

  // If preferred HH:MM is this minute, treat today as already handled so we don't fire "instantly".
  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (alarmState.enabled && currentHHMM === alarmState.preferredTime) {
    alarmState.lastFiredDate = todayKey(now);
    alarmState.nextFireAt = nextTimestamp(alarmState.preferredTime);
  }
}

function armWatchdog() {
  const token = ++watchToken;
  void (async () => {
    while (token === watchToken && alarmState.enabled) {
      const remaining = alarmState.nextFireAt - Date.now();
      if (remaining <= 0) {
        await checkAndFireAlarm();
        if (!alarmState.enabled || token !== watchToken) return;
        // After firing (or skipping), wait before next loop.
        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }
      const slice = Math.min(Math.max(1000, remaining), WATCH_SLICE_MS);
      await new Promise((resolve) => setTimeout(resolve, slice));
    }
  })();
}

async function checkAndFireAlarm() {
  if (!alarmState.enabled) return;
  // Hard block right after bell toggle / schedule update.
  if (armedAt && Date.now() - armedAt < ARM_GRACE_MS) return;

  const now = Date.now();
  if (!alarmState.nextFireAt || alarmState.nextFireAt > now + 2000) {
    if (!alarmState.nextFireAt || alarmState.nextFireAt <= 0) {
      alarmState.nextFireAt = nextTimestamp(alarmState.preferredTime);
      await saveConfig(snapshot());
    }
    return;
  }

  const today = todayKey();
  if (alarmState.lastFiredDate === today) {
    alarmState.nextFireAt = nextTimestamp(alarmState.preferredTime);
    await saveConfig(snapshot());
    return;
  }

  alarmState.lastFiredDate = today;
  alarmState.nextFireAt = nextTimestamp(alarmState.preferredTime);
  await saveConfig(snapshot());

  const tutor = String(alarmState.tutorName || "Alex").trim() || "Alex";
  const name = String(alarmState.kidName || "champ").trim() || "champ";
  const minutes = Math.max(5, Number(alarmState.goalMinutes) || 10);
  const icon = `/avatars/${String(alarmState.tutorId || "emma").trim() || "emma"}.png`;

  try {
    await self.registration.showNotification(`🚀 ${tutor} is waiting for you!`, {
      body: `Hey ${name}! Ready for today's quick ${minutes}-min English challenge?`,
      icon,
      badge: icon,
      tag: LOCAL_TAG,
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: "/" },
    });
  } catch (error) {
    console.warn("Local alarm notification failed:", error);
  }
}

async function clearPendingReminderNotifications() {
  const tags = [LOCAL_TAG, "buddyai-daily-practice", "buddyai-notify-test"];
  for (const tag of tags) {
    try {
      const list = await self.registration.getNotifications({ tag, includeTriggered: true });
      await Promise.all(list.map((item) => item.close()));
    } catch {
      try {
        const list = await self.registration.getNotifications({ tag });
        await Promise.all(list.map((item) => item.close()));
      } catch {
        /* ignore */
      }
    }
  }
}

function snapshot() {
  return {
    enabled: alarmState.enabled,
    hhmm: alarmState.preferredTime,
    preferredTime: alarmState.preferredTime,
    lastFiredDate: alarmState.lastFiredDate,
    nextFireAt: alarmState.nextFireAt,
    tutorName: alarmState.tutorName,
    tutorId: alarmState.tutorId,
    kidName: alarmState.kidName,
    goalMinutes: alarmState.goalMinutes,
  };
}

function normalizeHhmm(hhmm) {
  const [rawHour, rawMinute] = String(hhmm || "17:00").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 17;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
}

function nextTimestamp(hhmm, from = new Date()) {
  const [h, m] = normalizeHhmm(hhmm).split(":").map(Number);
  const next = new Date(from);
  next.setHours(h, m, 0, 0);
  if (next.getTime() <= from.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime();
}

function todayKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
