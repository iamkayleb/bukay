import { describe, expect, it } from "vitest";

import { createPrismaReminderStore, type ReminderStoreClient } from "@/app/lib/reminder-store";
import { MemorySmsProvider } from "@/app/lib/sms";
import { runReminderCycle } from "@/scripts/reminder-cron";

const HOUR = 60 * 60 * 1000;
const startsAt = new Date("2026-10-10T12:00:00Z");

function fakeClient(remindersEnabled: boolean) {
  const booking = { id: "b1", reminderSentAt: null as Date | null };
  const client: ReminderStoreClient = {
    booking: {
      async findMany(args) {
        const where = (args as { where: { tenant: { remindersEnabled: boolean } } }).where;
        if (where.tenant.remindersEnabled !== remindersEnabled) return [];
        return [
          {
            id: booking.id,
            tenantId: "t1",
            startsAt,
            reminderSentAt: booking.reminderSentAt,
            client: { name: "Ada", phone: "+2348000000001" },
            service: { name: "Haircut" },
          },
        ];
      },
      async findUnique() {
        return { startsAt, reminderSentAt: booking.reminderSentAt };
      },
      async updateMany({ where, data }) {
        const sent = booking.reminderSentAt;
        const ok =
          !where.OR ||
          where.OR.some((c) =>
            c.reminderSentAt === null ? sent === null : sent === null || sent < c.reminderSentAt.lt
          );
        if (!ok) return { count: 0 };
        booking.reminderSentAt = data.reminderSentAt;
        return { count: 1 };
      },
    },
  };
  return { client, booking };
}

describe("createPrismaReminderStore", () => {
  it("sends T-24h then T-2h once each, even with two parallel workers", async () => {
    const { client } = fakeClient(true);
    const sms = new MemorySmsProvider();
    const store = createPrismaReminderStore(client);
    const tick = (now: Date) =>
      Promise.all([runReminderCycle({ store, sms, now }), runReminderCycle({ store, sms, now })]);

    await tick(new Date(startsAt.getTime() - 24 * HOUR + 60_000));
    await tick(new Date(startsAt.getTime() - 2 * HOUR + 60_000));
    await tick(new Date(startsAt.getTime() - 2 * HOUR + 120_000));

    expect(sms.outbox).toHaveLength(2);
  });

  it("sends nothing when the tenant has reminders disabled", async () => {
    const { client } = fakeClient(false);
    const sms = new MemorySmsProvider();
    const store = createPrismaReminderStore(client);
    await runReminderCycle({
      store,
      sms,
      now: new Date(startsAt.getTime() - 24 * HOUR + 60_000),
    });
    expect(sms.outbox).toHaveLength(0);
  });
});
