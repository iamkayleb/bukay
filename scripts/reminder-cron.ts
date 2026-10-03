/** The cadence that bounds reminder delivery lateness. */
export const REMINDER_CRON_INTERVAL_MS = 5 * 60 * 1000;

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
  const onError =
    options.onError ?? ((error: unknown) => console.error("Reminder job failed", error));
  const setIntervalFn = options.setIntervalFn ?? setInterval;
  const clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  let running = false;

  const run = async (): Promise<void> => {
    if (running) return;

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
      clearIntervalFn(timer);
    },
  };
}
