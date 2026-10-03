import { describe, expect, it, vi } from "vitest";

import { REMINDER_CRON_INTERVAL_MS, startReminderCron } from "../../scripts/reminder-cron";

describe("reminder cron", () => {
  it("runs immediately and schedules subsequent scans every five minutes", async () => {
    let tick: (() => void) | undefined;
    const setIntervalFn = vi.fn((callback: () => void, _delay: number) => {
      tick = callback;
      return 42 as unknown as ReturnType<typeof setInterval>;
    });
    const clearIntervalFn = vi.fn();
    const job = vi.fn().mockResolvedValue(undefined);

    const cron = startReminderCron(job, { setIntervalFn, clearIntervalFn });

    await vi.waitFor(() => expect(job).toHaveBeenCalledTimes(1));
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(setIntervalFn).toHaveBeenCalledWith(expect.any(Function), REMINDER_CRON_INTERVAL_MS);

    tick?.();
    await vi.waitFor(() => expect(job).toHaveBeenCalledTimes(2));

    cron.stop();
    expect(clearIntervalFn).toHaveBeenCalledWith(42);
  });

  it("does not overlap a slow reminder scan", async () => {
    let tick: (() => void) | undefined;
    let finishJob: (() => void) | undefined;
    const job = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishJob = resolve;
        })
    );

    startReminderCron(job, {
      setIntervalFn: (callback: () => void) => {
        tick = callback;
        return 1 as unknown as ReturnType<typeof setInterval>;
      },
    });

    await vi.waitFor(() => expect(job).toHaveBeenCalledTimes(1));
    tick?.();
    expect(job).toHaveBeenCalledTimes(1);

    finishJob?.();
    await vi.waitFor(() => expect(finishJob).toBeDefined());
  });
});
