import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

const host = "127.0.0.1";
const port = process.env.PORT ?? "3001";
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? "30000");
const healthUrl = `http://${host}:${port}/api/health`;

const child = spawn("pnpm", ["dev", "--hostname", host, "--port", port], {
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
  if (
    text.includes("ready - started server") ||
    text.includes("Ready in") ||
    text.includes("Local:")
  ) {
    ready = true;
  }
};

child.stdout.on("data", handleOutput);
child.stderr.on("data", handleOutput);

const waitForReady = async () => {
  const start = Date.now();
  while (!ready) {
    if (child.exitCode !== null) {
      throw new Error("Dev server exited before becoming ready.");
    }
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out waiting for dev server. Output:\n${output}`);
    }
    await delay(200);
  }
};

const shutdown = async () => {
  if (child.exitCode !== null) {
    return;
  }
  child.kill("SIGTERM");
  const exited = Promise.race([once(child, "exit"), delay(5000)]);
  await exited;
  if (child.exitCode === null) {
    child.kill("SIGKILL");
  }
};

const run = async () => {
  try {
    await waitForReady();
    const response = await fetch(healthUrl);
    if (!response.ok) {
      throw new Error(`Health check failed with status ${response.status}.`);
    }
    const body = await response.json();
    if (!body || body.ok !== true || typeof body.version !== "string") {
      throw new Error(`Unexpected health response: ${JSON.stringify(body)}`);
    }
    process.stdout.write("Dev server is healthy.\n");
  } finally {
    await shutdown();
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
