const REMINDER_CACHE = "buddyai-reminder";
const REMINDER_URL = "/__buddyai/reminder-config";
const DB_NAME = "buddyai-reminders";
const STORE = "config";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "SAVE_REMINDER" || data.type === "SCHEDULE_REMINDER") {
    event.waitUntil(saveConfig(data.config));
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
    tag: "buddyai-daily-practice",
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
