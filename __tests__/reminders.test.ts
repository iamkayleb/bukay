import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetMemoryAdvisoryLocksForTests,
  advisoryLockKey,
  tryAdvisoryLock,
  releaseAdvisoryLock,
  withAdvisoryLock,
} from "@/app/lib/locks";
import {
  MemoryReminderStore,
  REMINDER_CRON_INTERVAL_MS,
  REMINDER_DISPATCH_TOLERANCE_MS,
  createPrismaReminderDeps,
  isWithinDispatchWindow,
  reminderSentForKind,
  reminderTargetAt,
  runReminderPass,
  type ReminderPrismaClient,
} from "@/app/lib/reminders";
import { MemorySmsProvider } from "@/app/lib/sms/memory";
import { buildDefaultReminderDeps, startReminderCron } from "../scripts/reminder-cron";

afterEach(() => {
  __resetMemoryAdvisoryLocksForTests();
});

function seedDueBooking(store: MemoryReminderStore, now: Date) {
  const tenantId = "tenant-1";
  store.upsertTenant({
    id: tenantId,
    name: "Demo Salon",
    remindersEnabled: true,
  });
  const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  store.upsertBooking({
    id: "booking-1",
    tenantId,
    startsAt,
    status: "confirmed",
    reminderSentAt: null,
    clientName: "Ada",
    clientPhone: "+2348011111111",
    serviceName: "Haircut",
    businessName: "Demo Salon",
  });
  return { tenantId, startsAt };
}

describe("reminder locks", () => {
  it("serializes two parallel workers so only one holds the advisory lock", async () => {
    const key = advisoryLockKey("reminder:booking-1:t24h");
    const order: string[] = [];

    const worker = async (label: string) => {
      const result = await withAdvisoryLock(null, key, async () => {
        order.push(`${label}:start`);
        await new Promise((r) => setTimeout(r, 30));
        order.push(`${label}:end`);
        return label;
      });
      return result;
    };

    const [a, b] = await Promise.all([worker("a"), worker("b")]);
    const acquired = [a, b].filter((r) => r.acquired);
    expect(acquired).toHaveLength(1);
    expect([a, b].filter((r) => !r.acquired)).toHaveLength(1);
  });

  it("try/release round-trips on the memory fallback", async () => {
    const key = 42;
    expect(await tryAdvisoryLock(null, key)).toBe(true);
    expect(await tryAdvisoryLock(null, key)).toBe(false);
    await releaseAdvisoryLock(null, key);
    expect(await tryAdvisoryLock(null, key)).toBe(true);
    await releaseAdvisoryLock(null, key);
  });
});

describe("reminder dispatch windows", () => {
  it("targets T-24h and T-2h offsets from startsAt", () => {
    const startsAt = new Date("2026-09-23T15:00:00.000Z");
    expect(reminderTargetAt(startsAt, "t24h").toISOString()).toBe("2026-09-22T15:00:00.000Z");
    expect(reminderTargetAt(startsAt, "t2h").toISOString()).toBe("2026-09-23T13:00:00.000Z");
  });

  it("treats dispatch within 5 minutes of the target as on-time", () => {
    const target = new Date("2026-09-22T15:00:00.000Z");
    expect(
      isWithinDispatchWindow(new Date(target.getTime() + REMINDER_DISPATCH_TOLERANCE_MS), target)
    ).toBe(true);
    expect(
      isWithinDispatchWindow(
        new Date(target.getTime() + REMINDER_DISPATCH_TOLERANCE_MS + 1),
        target
      )
    ).toBe(false);
  });

  it("cron interval is 5 minutes", () => {
    expect(REMINDER_CRON_INTERVAL_MS).toBe(5 * 60 * 1000);
  });
});

describe("reminder pass acceptance", () => {
  it("two parallel workers send exactly one reminder", async () => {
    const now = new Date("2026-09-22T15:00:00.000Z");
    const store = new MemoryReminderStore();
    seedDueBooking(store, now);
    const sms = new MemorySmsProvider();

    const deps = {
      bookings: store,
      claims: store,
      locks: null,
      sms,
      now: () => now,
    };

    const [a, b] = await Promise.all([runReminderPass(deps), runReminderPass(deps)]);
    const totalSent = a.sent.length + b.sent.length;

    expect(totalSent).toBe(1);
    expect(sms.outbox).toHaveLength(1);
    expect(store.bookings.get("booking-1")?.reminderSentAt?.toISOString()).toBe(now.toISOString());
  });

  it("records a send that falls within 5 minutes of the T-24h target", async () => {
    const target = new Date("2026-09-22T15:00:00.000Z");
    const now = new Date(target.getTime() + 2 * 60 * 1000);
    const store = new MemoryReminderStore();
    const startsAt = new Date(target.getTime() + 24 * 60 * 60 * 1000);
    store.upsertTenant({
      id: "tenant-1",
      name: "Demo Salon",
      remindersEnabled: true,
    });
    store.upsertBooking({
      id: "booking-2",
      tenantId: "tenant-1",
      startsAt,
      status: "confirmed",
      reminderSentAt: null,
      clientName: "Chi",
      clientPhone: "+2348022222222",
      serviceName: "Color",
      businessName: "Demo Salon",
    });
    const sms = new MemorySmsProvider();

    const summary = await runReminderPass({
      bookings: store,
      claims: store,
      sms,
      now: () => now,
    });

    expect(summary.sent).toHaveLength(1);
    const send = summary.sent[0];
    expect(send.kind).toBe("t24h");
    expect(Math.abs(send.sentAt.getTime() - send.targetAt.getTime())).toBeLessThanOrEqual(
      REMINDER_DISPATCH_TOLERANCE_MS
    );
  });

  it("disabling the tenant toggle stops subsequent reminders", async () => {
    const now = new Date("2026-09-22T15:00:00.000Z");
    const store = new MemoryReminderStore();
    seedDueBooking(store, now);
    const sms = new MemorySmsProvider();

    store.setRemindersEnabled("tenant-1", false);

    const first = await runReminderPass({
      bookings: store,
      claims: store,
      sms,
      now: () => now,
    });
    expect(first.sent).toHaveLength(0);
    expect(sms.outbox).toHaveLength(0);

    // Even after re-enabling would send; prove disabled path stayed quiet, then
    // confirm enabling works once — then disable again and ensure no more sends
    // for a fresh booking/kind.
    store.setRemindersEnabled("tenant-1", true);
    // Clear claim so a send can occur after re-enable.
    store.reset();
    seedDueBooking(store, now);
    store.setRemindersEnabled("tenant-1", true);

    const enabledPass = await runReminderPass({
      bookings: store,
      claims: store,
      sms,
      now: () => now,
    });
    expect(enabledPass.sent).toHaveLength(1);

    store.setRemindersEnabled("tenant-1", false);
    // New booking due in the same window — must not send while disabled.
    store.upsertBooking({
      id: "booking-later",
      tenantId: "tenant-1",
      startsAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: "confirmed",
      reminderSentAt: null,
      clientName: "Bee",
      clientPhone: "+2348033333333",
      serviceName: "Trim",
      businessName: "Demo Salon",
    });

    const afterDisable = await runReminderPass({
      bookings: store,
      claims: store,
      sms,
      now: () => now,
    });
    expect(afterDisable.sent).toHaveLength(0);
    expect(sms.outbox).toHaveLength(1);
  });
});

describe("reminder-cron job", () => {
  it("schedules ticks every 5 minutes", async () => {
    const intervals: number[] = [];
    const setIntervalFn = ((fn: () => void, ms: number) => {
      intervals.push(ms);
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval;
    const clearIntervalFn = vi.fn() as unknown as typeof clearInterval;

    const store = new MemoryReminderStore();
    const handle = startReminderCron({
      once: false,
      deps: { bookings: store, claims: store },
      setIntervalFn,
      clearIntervalFn,
      log: () => {},
    });

    expect(intervals).toEqual([REMINDER_CRON_INTERVAL_MS]);
    handle.stop();
    expect(clearIntervalFn).toHaveBeenCalled();
  });

  it("supports a once tick via startReminderCron({ once: true })", async () => {
    const store = new MemoryReminderStore();
    const logs: string[] = [];
    const handle = startReminderCron({
      once: true,
      deps: { bookings: store, claims: store },
      log: (m) => logs.push(m),
    });
    await handle.done;
    expect(logs.some((l) => l.includes("examined=0"))).toBe(true);
  });

  it("buildDefaultReminderDeps wires Prisma store and locks", async () => {
    const now = new Date("2026-09-22T15:00:00.000Z");
    const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const bookingRow = {
      id: "booking-db-1",
      tenantId: "tenant-db",
      startsAt,
      status: "confirmed",
      reminderSentAt: null as Date | null,
      client: { name: "Ada", phone: "+2348011111111" },
      service: { name: "Haircut" },
      tenant: { name: "Demo Salon" },
    };

    const db: ReminderPrismaClient = {
      $queryRaw: async () => [{ locked: true }],
      tenant: {
        findMany: async () => [{ id: "tenant-db" }],
        findUnique: async () => ({
          id: "tenant-db",
          name: "Demo Salon",
          remindersEnabled: true,
        }),
      },
      booking: {
        findMany: async () => [bookingRow],
        findFirst: async () => ({
          id: bookingRow.id,
          tenantId: bookingRow.tenantId,
          startsAt: bookingRow.startsAt,
          reminderSentAt: bookingRow.reminderSentAt,
        }),
        update: async (args: Record<string, unknown>) => {
          const data = args.data as { reminderSentAt: Date };
          bookingRow.reminderSentAt = data.reminderSentAt;
          return bookingRow;
        },
      },
    };

    const deps = buildDefaultReminderDeps(db);
    deps.now = () => now;
    deps.sms = new MemorySmsProvider();
    // Serialize parallel workers via in-memory advisory locks (pg mock is not concurrent-safe).
    deps.locks = null;

    const [a, b] = await Promise.all([runReminderPass(deps), runReminderPass(deps)]);
    expect(a.sent.length + b.sent.length).toBe(1);
    expect(bookingRow.reminderSentAt?.toISOString()).toBe(now.toISOString());
  });
});

describe("prisma reminder store", () => {
  it("reminderSentForKind treats a nearby reminderSentAt as a durable claim", () => {
    const startsAt = new Date("2026-09-23T15:00:00.000Z");
    const t24 = reminderTargetAt(startsAt, "t24h");
    expect(reminderSentForKind({ startsAt, reminderSentAt: t24 }, "t24h")).toBe(true);
    expect(reminderSentForKind({ startsAt, reminderSentAt: t24 }, "t2h")).toBe(false);
    expect(reminderSentForKind({ startsAt, reminderSentAt: null }, "t24h")).toBe(false);
  });

  it("skips a second pass after reminderSentAt is persisted for the kind", async () => {
    const now = new Date("2026-09-22T15:00:00.000Z");
    const startsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const bookingRow = {
      id: "booking-db-2",
      tenantId: "tenant-db",
      startsAt,
      status: "confirmed",
      reminderSentAt: null as Date | null,
      client: { name: "Chi", phone: "+2348022222222" },
      service: { name: "Color" },
      tenant: { name: "Demo Salon" },
    };

    const db: ReminderPrismaClient = {
      $queryRaw: async () => [{ locked: true }],
      tenant: {
        findMany: async () => [{ id: "tenant-db" }],
        findUnique: async () => ({
          id: "tenant-db",
          name: "Demo Salon",
          remindersEnabled: true,
        }),
      },
      booking: {
        findMany: async () => [bookingRow],
        findFirst: async () => ({
          id: bookingRow.id,
          tenantId: bookingRow.tenantId,
          startsAt: bookingRow.startsAt,
          reminderSentAt: bookingRow.reminderSentAt,
        }),
        update: async (args: Record<string, unknown>) => {
          const data = args.data as { reminderSentAt: Date };
          bookingRow.reminderSentAt = data.reminderSentAt;
          return bookingRow;
        },
      },
    };

    const sms = new MemorySmsProvider();
    const deps = createPrismaReminderDeps({ prisma: db, sms, now: () => now });
    deps.locks = null;

    const first = await runReminderPass(deps);
    expect(first.sent).toHaveLength(1);
    expect(await deps.claims.hasClaim("booking-db-2", "t24h")).toBe(true);

    // Simulate a fresh store (process restart) reading the persisted timestamp.
    const restarted = createPrismaReminderDeps({ prisma: db, sms, now: () => now });
    restarted.locks = null;
    const second = await runReminderPass(restarted);
    expect(second.sent).toHaveLength(0);
    expect(sms.outbox).toHaveLength(1);
  });
});
