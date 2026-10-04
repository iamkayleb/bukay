// Prisma-backed ReminderStore for scripts/reminder-cron.ts.
//
// Candidates come only from tenants with `remindersEnabled = true`, so turning
// the toggle off stops every later reminder. `claim` is one conditional
// `updateMany` on Booking.reminderSentAt: it succeeds only while the stored
// timestamp is before the reminder's target time, so of two parallel workers
// exactly one sees count 1.

import type { ReminderCandidate, ReminderKind, ReminderStore } from "@/scripts/reminder-cron";

const OFFSETS_MS: Record<ReminderKind, number> = {
  "t-24h": 24 * 60 * 60 * 1000,
  "t-2h": 2 * 60 * 60 * 1000,
};

type BookingRow = {
  id: string;
  tenantId: string;
  startsAt: Date;
  reminderSentAt: Date | null;
  client: { name: string; phone: string };
  service: { name: string };
};

export interface ReminderStoreClient {
  booking: {
    findMany(args: unknown): Promise<BookingRow[]>;
    findUnique(args: {
      where: { id: string };
      select: { startsAt: true; reminderSentAt: true };
    }): Promise<{ startsAt: Date; reminderSentAt: Date | null } | null>;
    updateMany(args: {
      where: {
        id: string;
        OR?: ({ reminderSentAt: null } | { reminderSentAt: { lt: Date } })[];
      };
      data: { reminderSentAt: Date | null };
    }): Promise<{ count: number }>;
  };
}

export function createPrismaReminderStore(client: ReminderStoreClient): ReminderStore {
  // Previous reminderSentAt per claim, so a failed send can be rolled back.
  const previous = new Map<string, Date | null>();

  return {
    async findCandidates(from, to): Promise<ReminderCandidate[]> {
      const rows = await client.booking.findMany({
        where: {
          status: "confirmed",
          startsAt: { gt: from, lte: to },
          tenant: { remindersEnabled: true },
        },
        select: {
          id: true,
          tenantId: true,
          startsAt: true,
          reminderSentAt: true,
          client: { select: { name: true, phone: true } },
          service: { select: { name: true } },
        },
      });
      return rows.map((row) => ({
        bookingId: row.id,
        tenantId: row.tenantId,
        clientPhone: row.client.phone,
        clientName: row.client.name,
        serviceName: row.service.name,
        startsAt: row.startsAt,
      }));
    },

    async claim(bookingId, kind, now) {
      const booking = await client.booking.findUnique({
        where: { id: bookingId },
        select: { startsAt: true, reminderSentAt: true },
      });
      if (!booking) return false;
      const target = new Date(booking.startsAt.getTime() - OFFSETS_MS[kind]);
      const { count } = await client.booking.updateMany({
        where: {
          id: bookingId,
          OR: [{ reminderSentAt: null }, { reminderSentAt: { lt: target } }],
        },
        data: { reminderSentAt: now },
      });
      if (count !== 1) return false;
      previous.set(`${bookingId}:${kind}`, booking.reminderSentAt);
      return true;
    },

    async release(bookingId, kind) {
      const key = `${bookingId}:${kind}`;
      const before = previous.get(key) ?? null;
      previous.delete(key);
      await client.booking.updateMany({
        where: { id: bookingId },
        data: { reminderSentAt: before },
      });
    },
  };
}
