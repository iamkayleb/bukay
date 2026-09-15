/**
 * Database-backed slot hold store. Holds persist via Prisma `SlotHold` rows
 * with an `expiresAt` timestamp (10-minute TTL). Process memory is not the
 * source of truth.
 */

import type { Prisma } from "@prisma/client";

import { isUniqueConstraintError } from "@/app/api/services/_helpers";

export const SLOT_HOLD_TTL_MS = 10 * 60 * 1000;

export type SlotHoldKey = {
  tenantId: string;
  serviceId: string;
  startsAt: Date;
};

export type SlotHoldRecord = {
  id: string;
  sessionId: string;
  bookingId: string | null;
  expiresAt: Date;
};

export type AcquireHoldResult =
  | { ok: true; expiresAt: Date; hold: SlotHoldRecord }
  | { ok: false; reason: "held"; expiresAt: Date; sessionId: string };

export interface Clock {
  now(): number;
}

type SlotHoldRow = {
  id: string;
  tenantId: string;
  serviceId: string;
  startsAt: Date;
  sessionId: string;
  bookingId: string | null;
  expiresAt: Date;
};

/** Minimal slot-hold delegate compatible with Prisma client and `$transaction` clients. */
export type SlotHoldDb = {
  slotHold: {
    deleteMany(args: { where: Prisma.SlotHoldWhereInput }): Promise<{ count: number }>;
    findFirst(args: { where: Prisma.SlotHoldWhereInput }): Promise<SlotHoldRow | null>;
    create(args: {
      data: {
        tenantId: string;
        serviceId: string;
        startsAt: Date;
        sessionId: string;
        bookingId: string | null;
        expiresAt: Date;
      };
    }): Promise<SlotHoldRow>;
    updateMany(args: {
      where: Prisma.SlotHoldWhereInput;
      data: {
        sessionId?: string;
        bookingId?: string | null;
        expiresAt?: Date;
      };
    }): Promise<{ count: number }>;
  };
};

const defaultClock: Clock = { now: () => Date.now() };
let activeClock: Clock = defaultClock;

export function bookingSlotLock(serviceId: string, startsAt: Date): string {
  return `${serviceId}|${startsAt.toISOString()}`;
}

export function __setSlotHoldClockForTests(clock: Clock): void {
  activeClock = clock;
}

export function __resetSlotHoldClockForTests(): void {
  activeClock = defaultClock;
}

export function currentHoldTime(nowMs?: number): Date {
  return new Date(nowMs ?? activeClock.now());
}

function toRecord(row: {
  id: string;
  sessionId: string;
  bookingId: string | null;
  expiresAt: Date;
}): SlotHoldRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    bookingId: row.bookingId,
    expiresAt: row.expiresAt,
  };
}

/**
 * Remove holds whose persisted `expiresAt` is at or before `now`.
 * Call before availability checks so expired rows do not block booking.
 */
export async function releaseExpiredHolds(
  db: SlotHoldDb,
  tenantId: string,
  now: Date = currentHoldTime()
): Promise<number> {
  const result = await db.slotHold.deleteMany({
    where: {
      tenantId,
      expiresAt: { lte: now },
    },
  });
  return result.count;
}

async function findHoldRow(db: SlotHoldDb, key: SlotHoldKey) {
  return db.slotHold.findFirst({
    where: {
      tenantId: key.tenantId,
      serviceId: key.serviceId,
      startsAt: key.startsAt,
    },
  });
}

export async function findActiveHold(
  db: SlotHoldDb,
  key: SlotHoldKey,
  now: Date = currentHoldTime()
): Promise<SlotHoldRecord | null> {
  await releaseExpiredHolds(db, key.tenantId, now);

  const row = await findHoldRow(db, key);
  if (!row) {
    return null;
  }

  if (row.expiresAt.getTime() <= now.getTime()) {
    await db.slotHold.deleteMany({
      where: { tenantId: key.tenantId, id: row.id },
    });
    return null;
  }

  return toRecord(row);
}

export async function isSlotHeld(
  db: SlotHoldDb,
  key: SlotHoldKey,
  sessionId?: string,
  now: Date = currentHoldTime()
): Promise<boolean> {
  const record = await findActiveHold(db, key, now);
  if (!record) {
    return false;
  }
  if (sessionId && record.sessionId === sessionId) {
    return false;
  }
  return true;
}

/**
 * Acquire or refresh a durable hold for `sessionId`. Another session's active
 * hold (expiresAt in the future) blocks acquisition. Relies on the unique
 * (tenantId, serviceId, startsAt) constraint for race safety.
 */
export async function tryAcquireHold(
  db: SlotHoldDb,
  key: SlotHoldKey,
  sessionId: string,
  options: { bookingId?: string | null; now?: Date } = {}
): Promise<AcquireHoldResult> {
  const now = options.now ?? currentHoldTime();
  await releaseExpiredHolds(db, key.tenantId, now);

  const existing = await findHoldRow(db, key);

  if (
    existing &&
    existing.expiresAt.getTime() > now.getTime() &&
    existing.sessionId !== sessionId
  ) {
    return {
      ok: false,
      reason: "held",
      expiresAt: existing.expiresAt,
      sessionId: existing.sessionId,
    };
  }

  const expiresAt = new Date(now.getTime() + SLOT_HOLD_TTL_MS);
  const bookingId =
    options.bookingId !== undefined ? options.bookingId : (existing?.bookingId ?? null);

  try {
    if (existing) {
      await db.slotHold.updateMany({
        where: { tenantId: key.tenantId, id: existing.id },
        data: {
          sessionId,
          bookingId,
          expiresAt,
        },
      });
      const updated = await findHoldRow(db, key);
      if (!updated) {
        throw new Error("slot hold disappeared after update");
      }
      return {
        ok: true,
        expiresAt: updated.expiresAt,
        hold: toRecord(updated),
      };
    }

    const created = await db.slotHold.create({
      data: {
        tenantId: key.tenantId,
        serviceId: key.serviceId,
        startsAt: key.startsAt,
        sessionId,
        bookingId,
        expiresAt,
      },
    });
    return {
      ok: true,
      expiresAt: created.expiresAt,
      hold: toRecord(created),
    };
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    const contested = await findHoldRow(db, key);
    if (contested && contested.expiresAt.getTime() > now.getTime()) {
      return {
        ok: false,
        reason: "held",
        expiresAt: contested.expiresAt,
        sessionId: contested.sessionId,
      };
    }

    if (contested) {
      return {
        ok: false,
        reason: "held",
        expiresAt: contested.expiresAt,
        sessionId: contested.sessionId,
      };
    }

    throw error;
  }
}

export async function releaseHold(db: SlotHoldDb, key: SlotHoldKey): Promise<boolean> {
  const result = await db.slotHold.deleteMany({
    where: {
      tenantId: key.tenantId,
      serviceId: key.serviceId,
      startsAt: key.startsAt,
    },
  });
  return result.count > 0;
}

export async function attachBookingToHold(
  db: SlotHoldDb,
  key: SlotHoldKey,
  sessionId: string,
  bookingId: string,
  now: Date = currentHoldTime()
): Promise<AcquireHoldResult> {
  return tryAcquireHold(db, key, sessionId, { bookingId, now });
}
