import { createHmac } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import http from "node:http";
import { spawn } from "node:child_process";
import lighthouse from "lighthouse";
import { launch } from "chrome-launcher";
import CDP from "chrome-remote-interface";

const SESSION_COOKIE_NAME = "bukay_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PORT = Number(process.env.LIGHTHOUSE_APP_PORT ?? 3000);
const ORIGIN = process.env.LIGHTHOUSE_APP_ORIGIN ?? `http://localhost:${PORT}`;
const TARGET_URL = process.env.LIGHTHOUSE_APP_URL ?? `${ORIGIN}/today`;
const REPORT_PATH =
  process.env.LIGHTHOUSE_REPORT_PATH ?? "lighthouse-reports/app-mobile-report.json";
const SESSION_KEY =
  process.env.SESSION_SECRET ??
  process.env.LIGHTHOUSE_SESSION_KEY ??
  "lighthouse-local-session-key";

function b64urlEncode(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function signSession(payload) {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", SESSION_KEY).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canReach(url) {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve(true);
    });
    request.setTimeout(1_000, () => {
      request.destroy();
      resolve(false);
    });
    request.on("error", () => resolve(false));
  });
}

async function waitForServer(url, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await canReach(url)) return;
    await wait(1_000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function startServerIfNeeded() {
  if (await canReach(TARGET_URL)) return null;

  const server = spawn("npm", ["run", "start", "--", "-p", String(PORT)], {
    env: { ...process.env, SESSION_SECRET: SESSION_KEY },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  server.stdout.on("data", (chunk) => process.stdout.write(chunk));
  server.stderr.on("data", (chunk) => process.stderr.write(chunk));

  await waitForServer(TARGET_URL);
  return server;
}

function stopServer(server) {
  if (server.killed) return;
  try {
    process.kill(-server.pid, "SIGTERM");
  } catch {
    server.kill("SIGTERM");
  }
}

async function setAuthenticatedSession(chrome) {
  const token = signSession({
    sub: "lighthouse-user",
    phone: "+2348012345678",
    tenantId: "lighthouse-tenant",
    tenantSlug: "lighthouse-workspace",
    iat: Date.now(),
    exp: Date.now() + SESSION_TTL_MS,
  });

  const client = await CDP({ port: chrome.port });
  try {
    await client.Network.enable();
    await client.Network.setCookie({
      name: SESSION_COOKIE_NAME,
      value: token,
      url: ORIGIN,
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    });
  } finally {
    await client.close();
  }
}

async function run() {
  let server = null;
  let chrome = null;

  try {
    server = await startServerIfNeeded();
    chrome = await launch({
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
    });
    await setAuthenticatedSession(chrome);

    const result = await lighthouse(TARGET_URL, {
      port: chrome.port,
      output: "json",
      logLevel: "info",
      formFactor: "mobile",
      screenEmulation: {
        mobile: true,
        width: 390,
        height: 844,
        deviceScaleFactor: 3,
        disabled: false,
      },
      throttlingMethod: "simulate",
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4,
        cpuSlowdownMultiplier: 4,
      },
      disableStorageReset: true,
      skipAudits: ["uses-http2"],
    });

    const performance = result.lhr.categories.performance.score;
    await mkdir("lighthouse-reports", { recursive: true });
    await writeFile(REPORT_PATH, result.report);

    if (performance < 0.9) {
      throw new Error(`Mobile performance score ${Math.round(performance * 100)} is below 90`);
    }

    console.log(`Wrote ${REPORT_PATH} with mobile performance ${Math.round(performance * 100)}`);
  } finally {
    if (chrome) await chrome.kill();
    if (server) stopServer(server);
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
