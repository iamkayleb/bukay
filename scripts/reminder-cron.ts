#!/usr/bin/env tsx
/**
 * Reminder cron entrypoint.
 *
 * Invokes a reminder dispatch pass every 5 minutes (T-24h / T-2h windows).
 * Designed to run as a long-lived process (`pnpm tsx scripts/reminder-cron.ts`)
 * or a single tick when `REMINDER_CRON_ONCE=1`.
 *
 * Duplicate-safety: each (booking, kind) send takes a Postgres advisory lock
 * via `app/lib/locks.ts` before claiming and sending.
 */

import { prisma } from "@/app/db/prisma";
import {
  REMINDER_CRON_INTERVAL_MS,
  createPrismaReminderDeps,
  runReminderPass,
  type ReminderDeps,
  type ReminderPrismaClient,
} from "@/app/lib/reminders";
import { termiiFromEnv } from "@/app/lib/sms";
import type { SmsProvider } from "@/app/lib/sms/provider";

export { REMINDER_CRON_INTERVAL_MS };

export type ReminderCronOptions = {
  /** Override deps (tests). When omitted, Prisma + optional Termii SMS are used. */
  deps?: ReminderDeps;
  /** Interval between ticks. Defaults to 5 minutes. */
  intervalMs?: number;
  /** Run a single tick then resolve (no interval). */
  once?: boolean;
  /** Injectable timer APIs for tests. */
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
  log?: (message: string) => void;
};

export type ReminderCronHandle = {
  /** Promise that resolves after `once` tick, or never for the interval loop. */
  done: Promise<void>;
  /** Stop the interval loop (no-op for `once`). */
  stop: () => void;
};

function optionalSmsFromEnv(): SmsProvider | null {
  if (!process.env.TERMII_API_KEY || !process.env.TERMII_SENDER_ID) {
    return null;
  }
  try {
    return termiiFromEnv();
  } catch {
    return null;
  }
}

/** Default production deps: Prisma bookings/claims/locks + Termii when configured. */
export function buildDefaultReminderDeps(
  db: ReminderPrismaClient = prisma as unknown as ReminderPrismaClient
): ReminderDeps {
  return createPrismaReminderDeps({
    prisma: db,
    sms: optionalSmsFromEnv(),
  });
}

/**
 * Start the reminder job. Returns a handle so callers (and tests) can stop it.
 */
export function startReminderCron(options: ReminderCronOptions = {}): ReminderCronHandle {
  const intervalMs = options.intervalMs ?? REMINDER_CRON_INTERVAL_MS;
  const log = options.log ?? ((message: string) => console.log(message));
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  const deps = options.deps ?? buildDefaultReminderDeps();

  let timer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;

  const tick = async () => {
    const summary = await runReminderPass(deps);
    log(
      `[reminder-cron] examined=${summary.examined} sent=${summary.sent.length} skipped=${summary.skipped}`
    );
  };

  if (options.once) {
    return {
      done: tick(),
      stop: () => {
        stopped = true;
      },
    };
  }

  let resolveDone: () => void = () => {};
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });

  // Fire immediately, then every `intervalMs` (default 5 minutes).
  void tick();
  timer = setIntervalFn(() => {
    if (stopped) return;
    void tick();
  }, intervalMs);

  return {
    done,
    stop: () => {
      stopped = true;
      if (timer !== null) {
        clearIntervalFn(timer);
        timer = null;
      }
      resolveDone();
    },
  };
}

function readOnceFromEnv(): boolean {
  const raw = process.env.REMINDER_CRON_ONCE;
  return raw === "1" || raw === "true";
}

async function main(): Promise<void> {
  const once = readOnceFromEnv();
  const handle = startReminderCron({ once });
  if (once) {
    await handle.done;
    return;
  }

  const shutdown = () => {
    handle.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  console.log(
    `[reminder-cron] running every ${REMINDER_CRON_INTERVAL_MS / 1000}s (Ctrl+C to stop)`
  );
  await handle.done;
}

const isDirectRun =
  typeof process.argv[1] === "string" &&
  /reminder-cron\.(ts|js|mjs|cjs)$/.test(process.argv[1].replace(/\\/g, "/"));

if (isDirectRun) {
  main().catch((error) => {
    console.error("[reminder-cron] fatal", error);
    process.exit(1);
  });
}
