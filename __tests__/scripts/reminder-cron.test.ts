import { describe, expect, it } from "vitest";

import { MemorySmsProvider } from "@/app/lib/sms";
import {
  dueReminderKind,
  runReminderCycle,
  type ReminderCandidate,
  type ReminderStore,
} from "@/scripts/reminder-cron";

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const startsAt = new Date("2026-10-10T12:00:00Z");
const at = (msBeforeStart: number) => new Date(startsAt.getTime() - msBeforeStart);

function candidate(overrides: Partial<ReminderCandidate> = {}): ReminderCandidate {
  return {
    bookingId: "b1",
    tenantId: "t1",
    clientPhone: "+2348000000001",
    clientName: "Ada",
    serviceName: "Haircut",
    startsAt,
    ...overrides,
  };
}

function memoryStore(candidates: ReminderCandidate[]) {
  const claimed = new Set<string>();
  const store: ReminderStore = {
    async findCandidates() {
      return candidates;
    },
    async claim(bookingId, kind) {
      const key = `${bookingId}:${kind}`;
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    async release(bookingId, kind) {
      claimed.delete(`${bookingId}:${kind}`);
    },
  };
  return { store, claimed };
}

describe("dueReminderKind", () => {
  it("is due from the target time until one interval later", () => {
    expect(dueReminderKind(startsAt, at(24 * HOUR))).toBe("t-24h");
    expect(dueReminderKind(startsAt, at(24 * HOUR - 4 * MIN))).toBe("t-24h");
    expect(dueReminderKind(startsAt, at(2 * HOUR))).toBe("t-2h");
  });

  it("is not due before the target or after the grace window", () => {
    expect(dueReminderKind(startsAt, at(24 * HOUR + MIN))).toBeNull();
    expect(dueReminderKind(startsAt, at(24 * HOUR - 5 * MIN))).toBeNull();
    expect(dueReminderKind(startsAt, at(12 * HOUR))).toBeNull();
  });

  it("is never due once the booking has started", () => {
    expect(dueReminderKind(startsAt, startsAt)).toBeNull();
  });
});

describe("runReminderCycle", () => {
  it("sends a due reminder", async () => {
    const sms = new MemorySmsProvider();
    const { store } = memoryStore([candidate()]);

    const result = await runReminderCycle({ store, sms, now: at(2 * HOUR - MIN) });

    expect(result).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(sms.outbox).toHaveLength(1);
    expect(sms.outbox[0].to).toBe("+2348000000001");
  });

  it("sends exactly one reminder when two workers run in parallel", async () => {
    const sms = new MemorySmsProvider();
    const { store } = memoryStore([candidate()]);
    const now = at(2 * HOUR - MIN);

    const results = await Promise.all([
      runReminderCycle({ store, sms, now }),
      runReminderCycle({ store, sms, now }),
    ]);

    expect(sms.outbox).toHaveLength(1);
    expect(results.reduce((n, r) => n + r.sent, 0)).toBe(1);
    expect(results.reduce((n, r) => n + r.skipped, 0)).toBe(1);
  });

  it("does not resend on a later tick", async () => {
    const sms = new MemorySmsProvider();
    const { store } = memoryStore([candidate()]);

    await runReminderCycle({ store, sms, now: at(2 * HOUR) });
    await runReminderCycle({ store, sms, now: at(2 * HOUR - 4 * MIN) });

    expect(sms.outbox).toHaveLength(1);
  });

  it("releases the claim when sending fails so a later tick retries", async () => {
    const sms = new MemorySmsProvider();
    const { store, claimed } = memoryStore([candidate()]);
    const send = sms.send.bind(sms);
    sms.send = async () => {
      throw new Error("boom");
    };
    const errors = console.error;
    console.error = () => {};

    const failed = await runReminderCycle({ store, sms, now: at(2 * HOUR) });
    console.error = errors;
    expect(failed).toEqual({ sent: 0, skipped: 0, failed: 1 });
    expect(claimed.size).toBe(0);

    sms.send = send;
    const retry = await runReminderCycle({ store, sms, now: at(2 * HOUR - MIN) });
    expect(retry.sent).toBe(1);
  });

  it("ignores candidates that are not due", async () => {
    const sms = new MemorySmsProvider();
    const { store } = memoryStore([candidate()]);

    const result = await runReminderCycle({ store, sms, now: at(10 * HOUR) });

    expect(result).toEqual({ sent: 0, skipped: 0, failed: 0 });
    expect(sms.outbox).toHaveLength(0);
  });
});
