/** The cadence that bounds reminder delivery lateness. */
export const REMINDER_CRON_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_REMINDER_DISPATCH_DELAY_MS = REMINDER_CRON_INTERVAL_MS;

export type ReminderJob = () => Promise<void>;

export type ReminderCron = {
  stop(): void;
};

type SetReminderInterval = (callback: () => void, delay: number) => ReturnType<typeof setInterval>;
type ClearReminderInterval = (timer: ReturnType<typeof setInterval>) => void;

/**
 * Runs a reminder job immediately and then every five minutes.
 *
 * A slow run must not be duplicated by the next timer tick: duplicate-safe
 * dispatch is handled by the job itself, while this guard avoids needless
 * concurrent scans in a single worker process.
 */
export function startReminderCron(
  job: ReminderJob,
  options: {
    intervalMs?: number;
    onError?: (error: unknown) => void;
    setIntervalFn?: SetReminderInterval;
    clearIntervalFn?: ClearReminderInterval;
  } = {}
): ReminderCron {
  const intervalMs = options.intervalMs ?? REMINDER_CRON_INTERVAL_MS;
  if (
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0 ||
    intervalMs > MAX_REMINDER_DISPATCH_DELAY_MS
  ) {
    throw new Error(
      "Reminder cron interval must be a positive finite number no greater than five minutes"
    );
  }

  const onError =
    options.onError ?? ((error: unknown) => console.error("Reminder job failed", error));
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let running = false;
  let stopped = false;

  const run = async (): Promise<void> => {
    if (running || stopped) return;

    running = true;
    try {
      await job();
    } catch (error) {
      onError(error);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setIntervalFn(() => void run(), intervalMs);

  return {
    stop() {
      stopped = true;
      clearIntervalFn(timer);
    },
  };
}
