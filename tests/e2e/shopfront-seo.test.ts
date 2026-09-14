import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { launch } from "chrome-launcher";
import lighthouse from "lighthouse";

const START_TIMEOUT_MS = 90_000;
const MIN_SEO_SCORE = 0.95;

let baseUrl: string;

async function findAvailablePort(): Promise<number> {
  const reservation = createServer();

  return new Promise((resolve, reject) => {
    reservation.once("error", reject);
    reservation.listen(0, "127.0.0.1", () => {
      const address = reservation.address();
      if (!address || typeof address === "string") {
        reservation.close(() => reject(new Error("Could not reserve a local test port.")));
        return;
      }

      reservation.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function nextBinary(): string {
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "next"),
    join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
  ];
  const binary = candidates.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error("Next.js is not installed. Run pnpm install before running end-to-end tests.");
  }

  return binary;
}

const bin = nextBinary();

describe("shopfront SEO (end-to-end)", () => {
  let server: ChildProcess | undefined;
  let serverOutput = "";

  beforeAll(async () => {
    const port = await findAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(bin, ["dev", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (server.exitCode !== null) {
        throw new Error(`Next dev server exited before becoming ready:\n${serverOutput}`);
      }

      try {
        const response = await fetch(`${baseUrl}/demo`);
        if (response.ok) return;
      } catch {
        // The server has not started yet.
      }
      await sleep(500);
    }
    throw new Error(
      `Next dev server did not become ready within ${START_TIMEOUT_MS}ms:\n${serverOutput}`
    );
  }, START_TIMEOUT_MS + 5_000);

  afterAll(async () => {
    if (!server || server.exitCode !== null) return;

    const exited = new Promise<void>((resolve) => server!.once("exit", () => resolve()));
    server.kill("SIGTERM");
    await Promise.race([exited, sleep(5_000)]);

    if (server.exitCode === null) {
      server.kill("SIGKILL");
      await exited;
    }
  });

  it("scores at least 95 for SEO in Lighthouse", async () => {
    const chrome = await launch({
      chromeFlags: ["--headless=new", "--no-sandbox", "--disable-gpu"],
    });
    try {
      const result = await lighthouse(`${baseUrl}/demo`, {
        onlyCategories: ["seo"],
        logLevel: "error",
        port: chrome.port,
      });
      const seoScore = result?.lhr.categories.seo.score;

      expect(seoScore).not.toBeNull();
      expect(seoScore).toBeGreaterThanOrEqual(MIN_SEO_SCORE);
    } finally {
      await chrome.kill();
    }
  }, 120_000);
});
