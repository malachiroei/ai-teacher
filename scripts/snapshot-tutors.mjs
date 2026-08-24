import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ALL_TUTORS = ["emma", "alex", "leo", "maya", "kai", "chloe"];
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".json": "application/json",
};

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  const filePath = path.normalize(path.join(root, urlPath === "/" ? "scripts/alex-snapshot.html" : urlPath.slice(1)));
  if (!filePath.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end(String(err));
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] ?? "application/octet-stream",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(data);
  });
});

function chromePath() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p));
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const s = http.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      s.close(() => resolve(addr.port));
    });
    s.on("error", reject);
  });
}

async function waitJson(url, tries = 40) {
  for (let i = 0; i < tries; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.json();
    } catch {
      /* chrome still booting */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Timeout waiting for ${url}`);
}

const requested = String(process.argv[2] || "all").toLowerCase();
const tutors = requested === "all" ? ALL_TUTORS : [requested];
if (tutors.some((id) => !ALL_TUTORS.includes(id))) {
  throw new Error(`Unknown tutor. Use one of: ${ALL_TUTORS.join(", ")}`);
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const staticPort = server.address().port;
const chrome = chromePath();
if (!chrome) {
  server.close();
  throw new Error("Chrome/Edge not found");
}

const dbgPort = await findFreePort();
const userData = path.join(root, "scripts", ".chrome-snap");
fs.rmSync(userData, { recursive: true, force: true });
fs.mkdirSync(userData, { recursive: true });

const child = spawn(
  chrome,
  [
    "--headless=new",
    "--hide-scrollbars",
    "--use-angle=d3d11",
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--force-device-scale-factor=1",
    `--window-size=1024,1024`,
    `--user-data-dir=${userData}`,
    `--remote-debugging-port=${dbgPort}`,
    "--remote-allow-origins=*",
    "about:blank",
  ],
  { stdio: "ignore" },
);

try {
  const pages = await waitJson(`http://127.0.0.1:${dbgPort}/json/list`);
  const page = pages.find((p) => p.type === "page") ?? pages[0];
  if (!page?.webSocketDebuggerUrl) throw new Error(`No page target: ${JSON.stringify(pages)}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve);
    ws.addEventListener("error", reject);
  });

  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      events.push(msg);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const next = ++id;
      pending.set(next, (msg) => {
        if (msg.error) reject(new Error(`${method}: ${JSON.stringify(msg.error)}`));
        else resolve(msg.result);
      });
      ws.send(JSON.stringify({ id: next, method, params }));
    });
  const waitEvent = (name, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      const start = Date.now();
      const tick = () => {
        const hit = events.find((e) => e.method === name && e._used !== true);
        if (hit) {
          hit._used = true;
          return resolve(hit);
        }
        if (Date.now() - start > timeoutMs) return reject(new Error(`Timeout ${name}`));
        setTimeout(tick, 50);
      };
      tick();
    });

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1024,
    height: 1024,
    deviceScaleFactor: 1,
    mobile: false,
  });

  for (const character of tutors) {
    await send("Page.navigate", {
      url: `http://127.0.0.1:${staticPort}/scripts/alex-snapshot.html?model=${character}`,
    });
    await waitEvent("Page.loadEventFired");

    let ready = false;
    for (let i = 0; i < 50; i += 1) {
      const result = await send("Runtime.evaluate", {
        expression: `document.documentElement.dataset.ready || document.documentElement.dataset.error || ""`,
        returnByValue: true,
      });
      const value = result?.result?.value ?? "";
      if (value === "1") {
        ready = true;
        const bbox = await send("Runtime.evaluate", {
          expression: `document.documentElement.dataset.bbox || ""`,
          returnByValue: true,
        });
        console.log(character, "bbox", bbox?.result?.value);
        break;
      }
      if (value && value !== "1") throw new Error(`Snapshot failed (${character}): ${value}`);
      await new Promise((r) => setTimeout(r, 200));
    }
    if (!ready) throw new Error(`Timed out waiting for GLB render (${character})`);

    const shot = await send("Page.captureScreenshot", { format: "png", fromSurface: true });
    const outPng = path.join(root, "public", "avatars", `${character}.png`);
    fs.writeFileSync(outPng, Buffer.from(shot.data, "base64"));
    console.log(`Wrote ${outPng} (${fs.statSync(outPng).size} bytes)`);
  }

  ws.close();
} finally {
  child.kill();
  server.close();
}
