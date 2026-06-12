import { spawn } from "node:child_process";
import { once } from "node:events";

const child = spawn("pnpm", ["build"], {
  stdio: "inherit",
  env: {
    ...process.env,
  },
});

const [code, signal] = await once(child, "exit");

if (signal) {
  console.error(`Build exited with signal ${signal}.`);
  process.exitCode = 1;
} else if (code !== 0) {
  console.error(`Build failed with exit code ${code}.`);
  process.exitCode = 1;
}
