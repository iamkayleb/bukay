import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import { once } from "node:events";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";

const SLUG = "shopfront-route-test";
const ESCAPED_METADATA_SLUG = "shopfront-route-escaped-metadata";
const START_TIMEOUT_MS = 90_000;
const REQUEST_TIMEOUT_MS = 10_000;
const prisma = new PrismaClient();

async function fetchWithTimeout(url: string): Promise<Response> {
  return fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

function headerValue(value: string | string[] | undefined): string | undefined {
  // Node preserves repeated response headers as an array. The route contract
  // evaluates the combined value so a second X-Robots-Tag cannot hide a
  // noindex directive from this real-HTTP assertion.
  return Array.isArray(value) ? value.join(", ") : value;
}

function localBinary(name: string): string {
  const binary = join(process.cwd(), "node_modules", ".bin", name);
  if (!existsSync(binary)) {
    throw new Error(`${name} is not installed; run pnpm install before running integration tests.`);
  }
  return binary;
}

async function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (!address || typeof address === "string") {
        listener.close();
        reject(new Error("Could not reserve a port for the Next.js integration server."));
        return;
      }
      listener.close((error) => (error ? reject(error) : resolve(address.port)));
    });
  });
}

async function waitForServer(url: string): Promise<void> {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      // A 404 can be returned before the development server has finished
      // compiling this dynamic route. Wait for the known seeded shopfront
      // itself so the test does not begin against a partially ready app.
      if ((await fetchWithTimeout(url)).ok) return;
    } catch {
      // The Next.js server is still starting.
    }
    await sleep(500);
  }
  throw new Error(`Next.js server did not become ready within ${START_TIMEOUT_MS}ms.`);
}

async function request(
  url: string,
): Promise<{
  body: string;
  contentType: string | undefined;
  location: string | undefined;
  robotsTag: string | undefined;
  status: number;
  ttfbMs: number;
}> {
  return new Promise((resolve, reject) => {
    const startedAt = performance.now();
    // Use a fresh connection for each request. A reused keep-alive socket can
    // hide connection and first-byte latency in the TTFB acceptance check.
    const req = http.get(url, { agent: false }, (response) => {
      const ttfbMs = performance.now() - startedAt;
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        clearTimeout(timeout);
        resolve({
          body: Buffer.concat(chunks).toString("utf8"),
          contentType: headerValue(response.headers["content-type"]),
          location: headerValue(response.headers.location),
          robotsTag: headerValue(response.headers["x-robots-tag"]),
          status: response.statusCode ?? 0,
          ttfbMs,
        });
      });
    });

    const timeout = setTimeout(() => {
      req.destroy(new Error(`Request to ${url} did not finish within ${REQUEST_TIMEOUT_MS}ms.`));
    }, REQUEST_TIMEOUT_MS);

    req.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

function metaContent(html: string, attribute: "name" | "property", value: string): string | undefined {
  const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];

  // Next can reorder tag attributes between releases. Select the complete
  // matching tag before reading content so this real-HTTP test asserts the
  // metadata contract, not a particular serializer attribute order.
  const tag = tags.find((candidate) =>
    new RegExp(`\\b${attribute}="${escapedValue}"`, "i").test(candidate),
  );
  return tag?.match(/\bcontent="([^"]*)"/i)?.[1];
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
  let baseUrl: string;

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

    await prisma.service.deleteMany({ where: { tenant: { slug: ESCAPED_METADATA_SLUG } } });
    await prisma.tenant.upsert({
      where: { slug: ESCAPED_METADATA_SLUG },
      update: { name: 'Escaped " & <Shopfront>' },
      create: { slug: ESCAPED_METADATA_SLUG, name: 'Escaped " & <Shopfront>' },
    });
    const escapedMetadataTenant = await prisma.tenant.findUniqueOrThrow({
      where: { slug: ESCAPED_METADATA_SLUG },
    });
    await prisma.service.create({
      data: {
        tenantId: escapedMetadataTenant.id,
        name: 'Style " & <Care>',
        durationMinutes: 30,
        priceCents: 5000,
      },
    });

    const port = await availablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = spawn(localBinary("next"), ["dev", "--port", String(port)], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "development",
        ROOT_HOST: baseUrl,
      },
      stdio: "ignore",
    });
    await waitForServer(`${baseUrl}/${SLUG}`);
    await request(`${baseUrl}/${SLUG}`);
  }, START_TIMEOUT_MS + 30_000);

  afterAll(async () => {
    await stop(server);
    await prisma.service.deleteMany({ where: { tenant: { slug: SLUG } } });
    await prisma.tenant.deleteMany({ where: { slug: SLUG } });
    await prisma.service.deleteMany({ where: { tenant: { slug: ESCAPED_METADATA_SLUG } } });
    await prisma.tenant.deleteMany({ where: { slug: ESCAPED_METADATA_SLUG } });
    await prisma.$disconnect();
  });

  it("serves a valid shopfront with its route metadata in under 500ms TTFB", async () => {
    const response = await request(`${baseUrl}/${SLUG}`);

    expect(response.status).toBe(200);
    // This public route must be directly crawlable. A redirect can cause
    // crawlers to associate route metadata with a different URL, while an
    // X-Robots-Tag header can suppress otherwise valid HTML metadata.
    expect(response.location).toBeUndefined();
    expect(response.robotsTag?.toLowerCase() ?? "").not.toContain("noindex");
    expect(response.ttfbMs).toBeLessThan(500);
    expect(response.contentType).toContain("text/html");
    const head = headContent(response.body);

    // Check the HTTP response itself for the minimum non-empty SEO contract,
    // in addition to the tenant-specific expected values below.
    expect(titleContent(head)?.trim()).not.toBe("");
    expect(metaContent(head, "name", "description")?.trim()).not.toBe("");
    expect(metaContent(head, "property", "og:title")?.trim()).not.toBe("");
    expect(metaContent(head, "property", "og:description")?.trim()).not.toBe("");
    const openGraphImage = metaContent(head, "property", "og:image");
    expect(openGraphImage?.trim()).not.toBe("");
    // Social crawlers resolve Open Graph images outside the current document,
    // so a non-empty relative value is still not a usable preview contract.
    // Assert the rendered HTTP response advertises an absolute web URL.
    const openGraphImageUrl = new URL(openGraphImage!);
    expect(["http:", "https:"]).toContain(openGraphImageUrl.protocol);

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
    // Open Graph previews must describe the same shopfront as the document
    // itself. Keeping these values coupled prevents a partial metadata change
    // from leaving social crawlers with stale title or description text.
    expect(metaContent(head, "property", "og:title")).toBe(titleContent(head));
    expect(metaContent(head, "property", "og:description")).toBe(
      metaContent(head, "name", "description"),
    );
    expect(openGraphImage).toBe(
      `${baseUrl}/${SLUG}/opengraph-image`,
    );
    expect(metaContent(head, "property", "og:image:alt")).toBe(
      "Integration Test Salon booking page on Bukay",
    );
    expect(metaContent(head, "property", "og:url")).toBe(`${baseUrl}/${SLUG}`);
    expect(metaContent(head, "property", "og:type")).toBe("website");
    expect(metaContent(head, "property", "og:locale")).toBe("en_NG");
    expect(metaContent(head, "property", "og:site_name")).toBe("Bukay");
    expect(metaContent(head, "property", "og:image:type")).toBe("image/png");
    expect(metaContent(head, "property", "og:image:width")).toBe("1200");
    expect(metaContent(head, "property", "og:image:height")).toBe("630");
    expect(linkHref(head, "canonical")).toBe(`${baseUrl}/${SLUG}`);
    // This is emitted through the route Metadata export rather than the
    // explicit head component. Check the rendered document so the two route
    // metadata surfaces remain active together for search crawlers.
    expect(metaContent(head, "name", "robots")).toBe("index, follow");

    // Next composes metadata from the route. Each primary tag must be emitted once,
    // so a second metadata surface cannot silently produce conflicting SEO values.
    expect(occurrences(head, "<title>")).toBe(1);
    expect(occurrences(head, 'name="description"')).toBe(1);
    expect(occurrences(head, 'property="og:title"')).toBe(1);
    expect(occurrences(head, 'property="og:description"')).toBe(1);
    expect(occurrences(head, 'property="og:image"')).toBe(1);
  });

  it("returns 404 for an unknown shopfront slug", async () => {
    const response = await request(`${baseUrl}/shopfront-route-test-missing`);
    const head = headContent(response.body);

    expect(response.status).toBe(404);
    // A not-found response must not retain any route metadata from the seeded
    // shopfront that was rendered earlier in this server process. This checks
    // the rendered document rather than the route helper, because metadata
    // composition and caching happen in the running Next.js app.
    expect(head).not.toContain("Integration Test Salon | Book with Bukay");
    expect(head).not.toContain("Book Integration Test Service and more with Integration Test Salon");
    expect(head).not.toContain(`${baseUrl}/${SLUG}`);
    // The app shell supplies generic site metadata for 404 pages. Verify it
    // remains generic rather than publishing stale tenant metadata.
    expect(metaContent(head, "property", "og:title")).toBe("Bukay");
  });

  it("renders escaped tenant values safely in the route metadata", async () => {
    const response = await request(`${baseUrl}/${ESCAPED_METADATA_SLUG}`);
    const head = headContent(response.body);

    expect(response.status).toBe(200);
    expect(titleContent(head)).toBe('Escaped &quot; &amp; &lt;Shopfront&gt; | Book with Bukay');
    expect(metaContent(head, "name", "description")).toBe(
      'Book Style &quot; &amp; &lt;Care&gt; and more with Escaped &quot; &amp; &lt;Shopfront&gt; on Bukay.',
    );
    expect(metaContent(head, "property", "og:title")).toBe(titleContent(head));
    expect(metaContent(head, "property", "og:description")).toBe(
      metaContent(head, "name", "description"),
    );
    expect(head).not.toContain('<Shopfront>');
    expect(head).not.toContain('<Care>');
  });

  it("returns 404 for an unknown shopfront's Open Graph image", async () => {
    const response = await request(`${baseUrl}/shopfront-route-test-missing/opengraph-image`);

    expect(response.status).toBe(404);
  });

  it("serves a PNG Open Graph image for the shopfront", async () => {
    const shopfront = await request(`${baseUrl}/${SLUG}`);
    const imageUrl = metaContent(headContent(shopfront.body), "property", "og:image");

    // Crawl the URL that the rendered document actually advertises. This keeps
    // the tag and generated image route from drifting apart unnoticed.
    expect(imageUrl).toBeTruthy();
    const response = await request(imageUrl!);

    expect(response.status).toBe(200);
    expect(response.contentType).toContain("image/png");
  });
});
