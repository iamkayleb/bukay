import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { tmpdir } from "node:os";
import lighthouse from "lighthouse";
import { PrismaClient } from "@prisma/client";

const PORT = 31475;
const CHROME_PORT = 9223;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 90_000;
const prisma = new PrismaClient();

function localBinary(name: string): string {
  const binary = join(process.cwd(), "node_modules", ".bin", name);
  if (!existsSync(binary)) {
    throw new Error(`${name} is not installed; run pnpm install before running the SEO audit.`);
  }
  return binary;
}

function chromeBinary(): string {
  const candidates = [process.env.CHROME_PATH, "google-chrome", "chromium", "chromium-browser"].filter(
    (candidate): candidate is string => Boolean(candidate),
  );
  const binary = candidates.find(
    (candidate) => spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0,
  );

  if (!binary) {
    throw new Error(
      "Chrome or Chromium is not installed; set CHROME_PATH or install google-chrome/chromium for the SEO audit.",
    );
  }

  return binary;
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The Next.js server is still starting.
    }
    await sleep(500);
  }
  throw new Error(`Next.js server did not become ready within ${START_TIMEOUT_MS}ms.`);
}

async function waitForChrome(): Promise<void> {
  const endpoint = `http://127.0.0.1:${CHROME_PORT}/json/version`;
  const deadline = Date.now() + START_TIMEOUT_MS;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(endpoint);
      const details = (await response.json()) as { webSocketDebuggerUrl?: string };
      if (response.ok && details.webSocketDebuggerUrl) return;
    } catch {
      // Chrome has not finished exposing its DevTools endpoint yet.
    }
    await sleep(250);
  }
  throw new Error(`Chrome did not become ready within ${START_TIMEOUT_MS}ms.`);
}

async function stop(process: ChildProcess | undefined): Promise<void> {
  if (!process || process.exitCode !== null) return;

  process.kill("SIGTERM");
  await Promise.race([once(process, "exit"), sleep(5_000)]);
  if (process.exitCode === null) process.kill("SIGKILL");
}

describe("shopfront SEO (end-to-end)", () => {
  let server: ChildProcess;
  let chrome: ChildProcess;
  let chromeDataDir: string | undefined;

  beforeAll(async () => {
    const prismaPush = spawn(localBinary("prisma"), ["db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    const [pushExitCode] = await once(prismaPush, "exit");
    if (pushExitCode !== 0) throw new Error(`prisma db push exited with code ${pushExitCode}.`);

    await prisma.service.deleteMany({ where: { tenant: { slug: "seo-audit" } } });
    await prisma.tenant.upsert({
      where: { slug: "seo-audit" },
      update: { name: "SEO Audit Salon" },
      create: { slug: "seo-audit", name: "SEO Audit Salon" },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: "seo-audit" } });
    await prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: "SEO Audit Service",
        durationMinutes: 30,
        priceCents: 5000,
      },
    });

    server = spawn(localBinary("next"), ["dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      // Metadata URLs must describe the same public origin that Lighthouse is
      // auditing. Without this, the test can pass while canonical and Open
      // Graph tags incorrectly point at the local development default.
      env: { ...process.env, NODE_ENV: "development", ROOT_HOST: BASE_URL },
      stdio: "ignore",
    });
    await waitForServer(`${BASE_URL}/seo-audit`);

    // An isolated profile prevents a concurrently running local Chrome from
    // taking over this process and closing its DevTools connection mid-audit.
    chromeDataDir = await mkdtemp(join(tmpdir(), "bukay-lighthouse-"));
    chrome = spawn(chromeBinary(), [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      `--remote-debugging-port=${CHROME_PORT}`,
      `--user-data-dir=${chromeDataDir}`,
      "about:blank",
    ]);
    await waitForChrome();
  }, START_TIMEOUT_MS + 30_000);

  afterAll(async () => {
    await stop(chrome);
    await stop(server);
    if (chromeDataDir) await rm(chromeDataDir, { force: true, recursive: true });
    await prisma.service.deleteMany({ where: { tenant: { slug: "seo-audit" } } });
    await prisma.tenant.deleteMany({ where: { slug: "seo-audit" } });
    await prisma.$disconnect();
  });

  it("renders the shopfront in headless Chrome with an SEO score of at least 95", async () => {
    const result = await lighthouse(`${BASE_URL}/seo-audit`, {
      port: CHROME_PORT,
      onlyCategories: ["seo"],
      output: "json",
      logLevel: "error",
    });
    const seoScore = result?.lhr.categories.seo.score;

    expect(seoScore).not.toBeNull();
    expect(seoScore).toBeGreaterThanOrEqual(0.95);
  }, 120_000);
});
