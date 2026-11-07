/**
 * Production supervisor (Windows & Linux): runs `next start`, restarts it automatically if it ever exits,
 * with exponential backoff, and keeps a heartbeat on /api/health. Ctrl+C / SIGTERM stops cleanly.
 *
 *   npm run build   (once)
 *   npm start       (PORT env, default 3000)
 *
 * For a Windows service use NSSM or pm2 (see docs/deployment.md) — they call this same script.
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const PORT = process.env.PORT || "3000";
const HOST = process.env.HOSTNAME || "0.0.0.0";

let child = null;
let stopping = false;
let restarts = 0;
let lastStart = 0;
let unhealthy = 0;

function log(...a) {
  console.log(`[supervisor ${new Date().toISOString()}]`, ...a);
}

function start() {
  lastStart = Date.now();
  child = spawn(process.execPath, ["--max-old-space-size=2048", nextBin, "start", "-p", PORT, "-H", HOST], {
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "production" },
  });
  log(`server started (pid ${child.pid}) on http://${HOST}:${PORT}`);
  child.on("exit", (code, signal) => {
    child = null;
    if (stopping) return;
    // reset backoff after 5 healthy minutes
    if (Date.now() - lastStart > 5 * 60_000) restarts = 0;
    const delay = Math.min(30_000, 1000 * 2 ** restarts++);
    log(`server exited (code ${code}, signal ${signal}). Restarting in ${delay} ms…`);
    setTimeout(start, delay);
  });
}

// Heartbeat: if the server hangs (no response for 3 checks), restart it.
setInterval(async () => {
  if (!child || Date.now() - lastStart < 60_000) return;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10_000);
    const r = await fetch(`http://127.0.0.1:${PORT}/api/health`, { signal: ctrl.signal });
    clearTimeout(t);
    // 503 = DB down: server itself is alive, don't restart it (it reconnects automatically)
    unhealthy = r.status === 200 || r.status === 503 ? 0 : unhealthy + 1;
  } catch {
    unhealthy++;
  }
  if (unhealthy >= 3 && child) {
    log("server unresponsive — restarting");
    unhealthy = 0;
    child.kill();
  }
}, 30_000).unref();

function shutdown() {
  stopping = true;
  log("stopping…");
  if (child) {
    child.kill("SIGTERM");
    setTimeout(() => process.exit(0), 10_000).unref();
    child.on("exit", () => process.exit(0));
  } else process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start();
