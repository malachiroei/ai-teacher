const REMINDER_CACHE = "buddyai-reminder";
const REMINDER_URL = "/__buddyai/reminder-config";
const DB_NAME = "buddyai-reminders";
const STORE = "config";
const LOCAL_TAG = "daily-practice-reminder";

let alarmState = {
  enabled: false,
  preferredTime: "17:00",
  lastFiredDate: "",
  tutorName: "Alex",
  tutorId: "emma",
  kidName: "champ",
  goalMinutes: 10,
};

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    self.clients.claim().then(async () => {
      const config = await loadConfig();
      if (!config) return;
      alarmState = {
        enabled: Boolean(config.enabled),
        preferredTime: normalizeHhmm(config.hhmm || config.preferredTime || "17:00"),
        lastFiredDate: String(config.lastFiredDate || ""),
        tutorName: String(config.tutorName || "Alex"),
        tutorId: String(config.tutorId || "emma"),
        kidName: String(config.kidName || "champ"),
        goalMinutes: Number(config.goalMinutes) || 10,
      };
      // Restore state only — never showNotification on activate.
    }),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SET_ALARM_TIME") {
    alarmState.enabled = Boolean(data.enabled);
    alarmState.preferredTime = normalizeHhmm(data.preferredTime || "17:00");
    if (data.lastFiredDate != null) alarmState.lastFiredDate = String(data.lastFiredDate || "");
    if (data.tutorName) alarmState.tutorName = String(data.tutorName);
    if (data.tutorId) alarmState.tutorId = String(data.tutorId);
    if (data.kidName != null) alarmState.kidName = String(data.kidName || "champ");
    if (data.goalMinutes != null) alarmState.goalMinutes = Number(data.goalMinutes) || 10;
    event.waitUntil(
      saveConfig({
        enabled: alarmState.enabled,
        hhmm: alarmState.preferredTime,
        preferredTime: alarmState.preferredTime,
        lastFiredDate: alarmState.lastFiredDate,
        tutorName: alarmState.tutorName,
        tutorId: alarmState.tutorId,
        kidName: alarmState.kidName,
        goalMinutes: alarmState.goalMinutes,
      }),
    );
    return;
  }
  if (data.type === "SAVE_REMINDER" || data.type === "SCHEDULE_REMINDER") {
    const config = data.config || {};
    alarmState.enabled = Boolean(config.enabled);
    alarmState.preferredTime = normalizeHhmm(config.hhmm || config.preferredTime || alarmState.preferredTime);
    if (config.lastFiredDate != null) alarmState.lastFiredDate = String(config.lastFiredDate || "");
    if (config.tutorName) alarmState.tutorName = String(config.tutorName);
    if (config.tutorId) alarmState.tutorId = String(config.tutorId);
    if (config.kidName != null) alarmState.kidName = String(config.kidName || "champ");
    if (config.goalMinutes != null) alarmState.goalMinutes = Number(config.goalMinutes) || 10;
    event.waitUntil(saveConfig(config));
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

// Pure interval check — showNotification only when HH:MM matches, never on message/save.
setInterval(() => {
  void checkAndFireAlarm();
}, 30000);

async function checkAndFireAlarm() {
  if (!alarmState.enabled) return;

  const now = new Date();
  const currentHHMM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (currentHHMM !== normalizeHhmm(alarmState.preferredTime)) return;
  if (alarmState.lastFiredDate === today) return;

  alarmState.lastFiredDate = today;
  await saveConfig({
    enabled: alarmState.enabled,
    hhmm: alarmState.preferredTime,
    preferredTime: alarmState.preferredTime,
    lastFiredDate: today,
    tutorName: alarmState.tutorName,
    tutorId: alarmState.tutorId,
    kidName: alarmState.kidName,
    goalMinutes: alarmState.goalMinutes,
  });

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

function normalizeHhmm(hhmm) {
  const [rawHour, rawMinute] = String(hhmm || "17:00").split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  const safeHour = Number.isFinite(hour) ? Math.min(23, Math.max(0, hour)) : 17;
  const safeMinute = Number.isFinite(minute) ? Math.min(59, Math.max(0, minute)) : 0;
  return `${String(safeHour).padStart(2, "0")}:${String(safeMinute).padStart(2, "0")}`;
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
