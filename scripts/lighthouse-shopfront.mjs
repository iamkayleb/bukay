// Manually verifies the shopfront route's (`/[slug]`) Lighthouse SEO score.
//
// `lighthouserc.json` (run in CI via .github/workflows/lighthouse-mobile.yml)
// only audits "/" and "/login" — extending it to cover `/[slug]` means
// editing CI automation config, which app/[slug]'s issue scope explicitly
// leaves untouched. This script is the manual equivalent: it boots a
// production server and runs Lighthouse against a seeded tenant's shopfront
// so the "Lighthouse SEO score is 95 or above" acceptance criterion can be
// checked locally on demand.
//
// Prerequisites: `pnpm build` and a seeded tenant (`pnpm db:seed` seeds the
// "demo" slug used by default).
//
// Usage: `node scripts/lighthouse-shopfront.mjs [slug]`

import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const host = "127.0.0.1";
const port = process.env.PORT ?? "3100";
const slug = process.argv[2] ?? process.env.SHOPFRONT_SLUG ?? "demo";
const minSeoScore = Number(process.env.MIN_SEO_SCORE ?? "0.95");
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "30000");

const server = spawn("pnpm", ["start", "--hostname", host, "--port", port], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    PORT: port,
  },
});

let output = "";
let ready = false;

const handleOutput = (chunk) => {
  const text = chunk.toString();
  output += text;
  if (text.includes("Ready in") || text.includes("started server")) {
    ready = true;
  }
};

server.stdout.on("data", handleOutput);
server.stderr.on("data", handleOutput);

const waitForReady = async () => {
  const start = Date.now();
  while (!ready) {
    if (server.exitCode !== null) {
      throw new Error(`Server exited before becoming ready. Output:\n${output}`);
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for server. Output:\n${output}`);
    }
    await delay(200);
  }
};

const shutdown = async () => {
  if (server.exitCode !== null) {
    return;
  }
  server.kill("SIGTERM");
  const exited = Promise.race([once(server, "exit"), delay(5000)]);
  await exited;
  if (server.exitCode === null) {
    server.kill("SIGKILL");
  }
};

const runLighthouse = async (url) => {
  const outDir = await mkdtemp(path.join(tmpdir(), "lighthouse-shopfront-"));
  const outPath = path.join(outDir, "report.json");

  try {
    const lighthouse = spawn(
      "npx",
      [
        "--yes",
        "lighthouse@13.x",
        url,
        "--only-categories=seo",
        "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
        "--output=json",
        `--output-path=${outPath}`,
        "--quiet",
      ],
      { stdio: "inherit" }
    );
    const [code] = await once(lighthouse, "exit");
    if (code !== 0) {
      throw new Error(`Lighthouse exited with code ${code}.`);
    }

    const report = JSON.parse(await readFile(outPath, "utf8"));
    return report.categories.seo.score;
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
};

const run = async () => {
  try {
    await waitForReady();
    const url = `http://${host}:${port}/${slug}`;
    const seoScore = await runLighthouse(url);
    const seoPercent = Math.round(seoScore * 100);

    process.stdout.write(`SEO score for ${url}: ${seoPercent}\n`);
    if (seoScore < minSeoScore) {
      throw new Error(
        `SEO score ${seoPercent} is below the required ${Math.round(minSeoScore * 100)}.`
      );
    }
  } finally {
    await shutdown();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
