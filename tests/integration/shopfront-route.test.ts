import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { once } from "node:events";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

const PORT = 31474;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const SLUG = "shopfront-route-test";
const START_TIMEOUT_MS = 90_000;
const prisma = new PrismaClient();

function localBinary(name: string): string {
  const binary = join(process.cwd(), "node_modules", ".bin", name);
  if (!existsSync(binary)) {
    throw new Error(`${name} is not installed; run pnpm install before running integration tests.`);
  }
  return binary;
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      // A 404 can be returned before the development server has finished
      // compiling this dynamic route. Wait for the known seeded shopfront
      // itself so the test does not begin against a partially ready app.
      if ((await fetch(url)).ok) return;
    } catch {
      // The Next.js server is still starting.
    }
    await sleep(500);
  }
  throw new Error(`Next.js server did not become ready within ${START_TIMEOUT_MS}ms.`);
}

async function request(
  url: string,
): Promise<{ body: string; contentType: string | undefined; status: number; ttfbMs: number }> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    const req = http.get(url, (response) => {
      const ttfbMs = performance.now() - startedAt;
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        resolve({
          body: Buffer.concat(chunks).toString("utf8"),
          contentType: response.headers["content-type"],
          status: response.statusCode ?? 0,
          ttfbMs,
        });
      });
    });

    req.on("error", reject);
  });
}

function metaContent(html: string, attribute: "name" | "property", value: string): string | undefined {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(
      `<meta(?=[^>]*\\b${attribute}="${escapedValue}")(?=[^>]*\\bcontent="([^"]+)")[^>]*>`,
    ),
  );
  return match?.[1];
}

function headContent(html: string): string {
  const match = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!match) throw new Error("The shopfront response did not include a document head.");
  return match[1];
}

function titleContent(html: string): string | undefined {
  return html.match(/<title>([^<]+)<\/title>/i)?.[1];
}

function linkHref(html: string, rel: string): string | undefined {
  const escapedRel = rel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(
    new RegExp(`<link(?=[^>]*\\brel="${escapedRel}")(?=[^>]*\\bhref="([^"]+)")[^>]*>`),
  );
  return match?.[1];
}

function occurrences(html: string, value: string): number {
  return html.split(value).length - 1;
}

async function stop(server: ChildProcess | undefined): Promise<void> {
  if (!server || server.exitCode !== null) return;

  server.kill("SIGTERM");
  await Promise.race([once(server, "exit"), sleep(5_000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
}

describe("shopfront route (integration)", () => {
  let server: ChildProcess;

  beforeAll(async () => {
    const prismaPush = spawn(localBinary("prisma"), ["db", "push", "--skip-generate"], {
      cwd: process.cwd(),
      stdio: "inherit",
    });
    const [pushExitCode] = await once(prismaPush, "exit");
    if (pushExitCode !== 0) throw new Error(`prisma db push exited with code ${pushExitCode}.`);

    await prisma.service.deleteMany({ where: { tenant: { slug: SLUG } } });
    await prisma.tenant.upsert({
      where: { slug: SLUG },
      update: { name: "Integration Test Salon" },
      create: { slug: SLUG, name: "Integration Test Salon" },
    });
    const tenant = await prisma.tenant.findUniqueOrThrow({ where: { slug: SLUG } });
    await prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: "Integration Test Service",
        durationMinutes: 30,
        priceCents: 5000,
      },
    });

    server = spawn(localBinary("next"), ["dev", "--port", String(PORT)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        ROOT_HOST: BASE_URL,
      },
      stdio: "ignore",
    });
    await waitForServer(`${BASE_URL}/${SLUG}`);
    await request(`${BASE_URL}/${SLUG}`);
  }, START_TIMEOUT_MS + 30_000);

  afterAll(async () => {
    await stop(server);
    await prisma.service.deleteMany({ where: { tenant: { slug: SLUG } } });
    await prisma.tenant.deleteMany({ where: { slug: SLUG } });
    await prisma.$disconnect();
  });

  it("serves a valid shopfront with its route metadata in under 500ms TTFB", async () => {
    const response = await request(`${BASE_URL}/${SLUG}`);

    expect(response.status).toBe(200);
    expect(response.ttfbMs).toBeLessThan(500);
    const head = headContent(response.body);

    // Check the HTTP response itself for the minimum non-empty SEO contract,
    // in addition to the tenant-specific expected values below.
    expect(titleContent(head)?.trim()).not.toBe("");
    expect(metaContent(head, "name", "description")?.trim()).not.toBe("");
    expect(metaContent(head, "property", "og:title")?.trim()).not.toBe("");
    expect(metaContent(head, "property", "og:description")?.trim()).not.toBe("");
    expect(metaContent(head, "property", "og:image")?.trim()).not.toBe("");

    expect(head).toContain("<title>Integration Test Salon | Book with Bukay</title>");
    expect(metaContent(head, "name", "description")).toBe(
      "Book Integration Test Service and more with Integration Test Salon on Bukay.",
    );
    expect(metaContent(head, "property", "og:title")).toBe(
      "Integration Test Salon | Book with Bukay",
    );
    expect(metaContent(head, "property", "og:description")).toBe(
      "Book Integration Test Service and more with Integration Test Salon on Bukay.",
    );
    expect(metaContent(head, "property", "og:image")).toBe(
      `${BASE_URL}/${SLUG}/opengraph-image`,
    );
    expect(metaContent(head, "property", "og:image:alt")).toBe(
      "Integration Test Salon booking page on Bukay",
    );
    expect(metaContent(head, "property", "og:url")).toBe(`${BASE_URL}/${SLUG}`);
    expect(metaContent(head, "property", "og:type")).toBe("website");
    expect(linkHref(head, "canonical")).toBe(`${BASE_URL}/${SLUG}`);

    // Next composes metadata from the route. Each primary tag must be emitted once,
    // so a second metadata surface cannot silently produce conflicting SEO values.
    expect(occurrences(head, "<title>")).toBe(1);
    expect(occurrences(head, 'name="description"')).toBe(1);
    expect(occurrences(head, 'property="og:title"')).toBe(1);
    expect(occurrences(head, 'property="og:description"')).toBe(1);
    expect(occurrences(head, 'property="og:image"')).toBe(1);
  });

  it("returns 404 for an unknown shopfront slug", async () => {
    const response = await request(`${BASE_URL}/shopfront-route-test-missing`);

    expect(response.status).toBe(404);
  });

  it("serves a PNG Open Graph image for the shopfront", async () => {
    const response = await request(`${BASE_URL}/${SLUG}/opengraph-image`);

    expect(response.status).toBe(200);
    expect(response.contentType).toContain("image/png");
  });
});
