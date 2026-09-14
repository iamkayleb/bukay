import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.SHOPFRONT_TEST_PORT ?? "31474";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 90_000;
const MAX_TTFB_MS = 500;

function nextBinary(): string {
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "next"),
    join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
  ];
  const binary = candidates.find((candidate) => existsSync(candidate));
  if (!binary) {
    throw new Error("Next.js is not installed. Run pnpm install before running integration tests.");
  }

  return binary;
}

function requestWithTtfb(pathname: string): Promise<{ status: number; ttfbMs: number; body: string }> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const req = request(`${BASE_URL}${pathname}`, (response) => {
      const ttfbMs = performance.now() - startedAt;
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          ttfbMs,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });

    req.on("error", reject);
    req.end();
  });
}

const bin = nextBinary();

describe("GET /[slug] (integration)", () => {
  let server: ChildProcess | undefined;

  beforeAll(async () => {
    server = spawn(bin!, ["dev", "-p", PORT], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        // Compile the shopfront before measuring it so the TTFB assertion
        // captures request performance rather than development-server startup.
        const response = await fetch(`${BASE_URL}/demo`);
        if (response.ok) return;
      } catch {
        // The server has not started yet.
      }
      await sleep(500);
    }
    throw new Error(`Next dev server did not become ready within ${START_TIMEOUT_MS}ms`);
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

  it("returns rendered HTML with TTFB below 500ms for a valid shopfront", async () => {
    const response = await requestWithTtfb("/demo");

    expect(response.status).toBe(200);
    expect(response.ttfbMs).toBeLessThan(MAX_TTFB_MS);
    expect(response.body).toContain("Bukay Demo Salon");
    expect(response.body).toContain('<meta name="description"');
    expect(response.body).toContain('property="og:title"');
    expect(response.body).toContain('property="og:description"');
    expect(response.body).toContain('property="og:image"');
  });

  it("returns 404 for an unknown shopfront", async () => {
    const response = await requestWithTtfb("/shopfront-that-does-not-exist");

    expect(response.status).toBe(404);
  });
});
