import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const PORT = process.env.HEALTH_TEST_PORT ?? "31473";
const BASE_URL = `http://127.0.0.1:${PORT}`;
const START_TIMEOUT_MS = 90_000;

function nextBinary(): string | null {
  const candidates = [
    join(process.cwd(), "node_modules", ".bin", "next"),
    join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

const bin = nextBinary();
const suite = bin ? describe : describe.skip;

suite("GET /api/health (integration)", () => {
  let server: ChildProcess;

  beforeAll(async () => {
    server = spawn(bin!, ["dev", "-p", PORT], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: "development" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    const deadline = Date.now() + START_TIMEOUT_MS;
    while (Date.now() < deadline) {
      try {
        const res = await fetch(`${BASE_URL}/api/health`);
        if (res.ok) return;
      } catch {
        // server not ready yet
      }
      await sleep(500);
    }
    throw new Error(`Next dev server did not become ready within ${START_TIMEOUT_MS}ms`);
  }, START_TIMEOUT_MS + 5_000);

  afterAll(() => {
    if (server && !server.killed) {
      server.kill("SIGTERM");
    }
  });

  it("returns 200 and JSON body with ok + version", async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; version: string };
    expect(body.ok).toBe(true);
    expect(typeof body.version).toBe("string");
    expect(body.version.length).toBeGreaterThan(0);
  });
});
