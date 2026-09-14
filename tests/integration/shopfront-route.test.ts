import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { request } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { setTimeout as sleep } from "node:timers/promises";

let port = Number(process.env.SHOPFRONT_TEST_PORT);
let baseUrl: string;
const START_TIMEOUT_MS = 90_000;
const MAX_TTFB_MS = 500;
const REQUEST_TIMEOUT_MS = 10_000;

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
    throw new Error("Next.js is not installed. Run pnpm install before running integration tests.");
  }

  return binary;
}

function requestWithTtfb(
  pathname: string
): Promise<{ status: number; ttfbMs: number; contentType: string; body: string }> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const req = request(`${baseUrl}${pathname}`, (response) => {
      const ttfbMs = performance.now() - startedAt;
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          ttfbMs,
          contentType: response.headers["content-type"] ?? "",
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
      response.on("error", reject);
    });

    req.on("error", reject);
    req.setTimeout(REQUEST_TIMEOUT_MS, () => {
      req.destroy(new Error(`Request to ${pathname} did not complete within ${REQUEST_TIMEOUT_MS}ms.`));
    });
    req.end();
  });
}

const bin = nextBinary();

describe("GET /[slug] (integration)", () => {
  let server: ChildProcess | undefined;
  let serverOutput = "";

  beforeAll(async () => {
    // A fixed port makes this suite vulnerable to accidentally testing an
    // unrelated already-running Next server. CI can still supply a port when
    // its network policy requires one.
    if (!Number.isInteger(port) || port <= 0) {
      port = await findAvailablePort();
    }
    baseUrl = `http://127.0.0.1:${port}`;

    server = spawn(bin!, ["dev", "-p", String(port)], {
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
        // Compile the shopfront before measuring it so the TTFB assertion
        // captures request performance rather than development-server startup.
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

  it("returns rendered HTML with TTFB below 500ms for a valid shopfront", async () => {
    const response = await requestWithTtfb("/demo");

    expect(response.status).toBe(200);
    expect(response.ttfbMs).toBeLessThan(MAX_TTFB_MS);
    expect(response.contentType).toContain("text/html");
    expect(response.body).toContain("Bukay Demo Salon");
    expect(response.body).toContain("<title>Book appointments online | Bukay</title>");
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
