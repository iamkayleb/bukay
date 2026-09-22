/**
 * T-24h / T-2h booking reminder dispatch.
 *
 * Duplicate-safe across parallel workers via Postgres advisory locks
 * (`app/lib/locks.ts`) plus a per-(booking, kind) claim set. Tenants can
 * disable reminders with `remindersEnabled`; when off, no new sends occur.
 */

import { advisoryLockKey, type AdvisoryLockDb, withAdvisoryLock } from "@/app/lib/locks";
import type { SmsProvider } from "@/app/lib/sms/provider";
import type { WhatsAppProvider } from "@/app/lib/whatsapp/provider";
import { WHATSAPP_TEMPLATES } from "@/app/lib/whatsapp/templates";

/** Cron cadence: invoke the tick at least this often. */
export const REMINDER_CRON_INTERVAL_MS = 5 * 60 * 1000;

/** A send is on-time when |sentAt − target| ≤ this window. */
export const REMINDER_DISPATCH_TOLERANCE_MS = 5 * 60 * 1000;

export type ReminderKind = "t24h" | "t2h";

export const REMINDER_OFFSETS_MS: Record<ReminderKind, number> = {
  t24h: 24 * 60 * 60 * 1000,
  t2h: 2 * 60 * 60 * 1000,
};

export type ReminderTenant = {
  id: string;
  name: string;
  remindersEnabled: boolean;
};

export type ReminderBooking = {
  id: string;
  tenantId: string;
  startsAt: Date;
  status: string;
  reminderSentAt: Date | null;
  clientName: string;
  clientPhone: string;
  serviceName: string;
  businessName: string;
};

export type ReminderClaimStore = {
  hasClaim(bookingId: string, kind: ReminderKind): boolean | Promise<boolean>;
  claim(bookingId: string, kind: ReminderKind): boolean | Promise<boolean>;
};

export type ReminderBookingStore = {
  listDueCandidates(args: { now: Date; windowMs: number }): Promise<ReminderBooking[]>;
  getTenant(tenantId: string): Promise<ReminderTenant | null>;
  markReminderSent(bookingId: string, sentAt: Date): Promise<void>;
};

export type ReminderSendResult = {
  channel: "sms" | "whatsapp";
  id: string;
  bookingId: string;
  kind: ReminderKind;
  targetAt: Date;
  sentAt: Date;
};

export type ReminderDeps = {
  bookings: ReminderBookingStore;
  claims: ReminderClaimStore;
  locks?: AdvisoryLockDb | null;
  sms?: SmsProvider | null;
  whatsapp?: WhatsAppProvider | null;
  now?: () => Date;
};

export type ReminderPassSummary = {
  examined: number;
  sent: ReminderSendResult[];
  skipped: number;
};

export function reminderTargetAt(startsAt: Date, kind: ReminderKind): Date {
  return new Date(startsAt.getTime() - REMINDER_OFFSETS_MS[kind]);
}

export function isWithinDispatchWindow(
  now: Date,
  targetAt: Date,
  toleranceMs: number = REMINDER_DISPATCH_TOLERANCE_MS
): boolean {
  return Math.abs(now.getTime() - targetAt.getTime()) <= toleranceMs;
}

export function dueReminderKinds(
  booking: Pick<ReminderBooking, "startsAt" | "status">,
  now: Date,
  toleranceMs: number = REMINDER_DISPATCH_TOLERANCE_MS
): ReminderKind[] {
  if (booking.status === "cancelled") {
    return [];
  }
  const kinds: ReminderKind[] = [];
  for (const kind of Object.keys(REMINDER_OFFSETS_MS) as ReminderKind[]) {
    const target = reminderTargetAt(booking.startsAt, kind);
    if (isWithinDispatchWindow(now, target, toleranceMs)) {
      kinds.push(kind);
    }
  }
  return kinds;
}

function buildSmsBody(booking: ReminderBooking, kind: ReminderKind): string {
  const when = booking.startsAt.toISOString();
  const lead = kind === "t24h" ? "24h" : "2h";
  return `Hi ${booking.clientName}, reminder (${lead}): ${booking.serviceName} is coming up on ${when} at ${booking.businessName}. Reply STOP to opt out.`;
}

/**
 * In-memory claim + booking store for unit tests (parallel workers, toggle).
 */
export class MemoryReminderStore implements ReminderBookingStore, ReminderClaimStore {
  readonly tenants = new Map<string, ReminderTenant>();
  readonly bookings = new Map<string, ReminderBooking>();
  private readonly claims = new Set<string>();

  upsertTenant(tenant: ReminderTenant): void {
    this.tenants.set(tenant.id, { ...tenant });
  }

  upsertBooking(booking: ReminderBooking): void {
    this.bookings.set(booking.id, {
      ...booking,
      startsAt: new Date(booking.startsAt),
      reminderSentAt: booking.reminderSentAt ? new Date(booking.reminderSentAt) : null,
    });
  }

  setRemindersEnabled(tenantId: string, enabled: boolean): void {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) {
      throw new Error(`Unknown tenant ${tenantId}`);
    }
    this.tenants.set(tenantId, { ...tenant, remindersEnabled: enabled });
  }

  claimKey(bookingId: string, kind: ReminderKind): string {
    return `${bookingId}:${kind}`;
  }

  hasClaim(bookingId: string, kind: ReminderKind): boolean {
    return this.claims.has(this.claimKey(bookingId, kind));
  }

  claim(bookingId: string, kind: ReminderKind): boolean {
    const key = this.claimKey(bookingId, kind);
    if (this.claims.has(key)) {
      return false;
    }
    this.claims.add(key);
    return true;
  }

  async getTenant(tenantId: string): Promise<ReminderTenant | null> {
    return this.tenants.get(tenantId) ?? null;
  }

  async listDueCandidates(args: { now: Date; windowMs: number }): Promise<ReminderBooking[]> {
    const out: ReminderBooking[] = [];
    for (const booking of this.bookings.values()) {
      if (dueReminderKinds(booking, args.now, args.windowMs).length > 0) {
        out.push({
          ...booking,
          startsAt: new Date(booking.startsAt),
          reminderSentAt: booking.reminderSentAt ? new Date(booking.reminderSentAt) : null,
        });
      }
    }
    return out;
  }

  async markReminderSent(bookingId: string, sentAt: Date): Promise<void> {
    const booking = this.bookings.get(bookingId);
    if (!booking) return;
    this.bookings.set(bookingId, {
      ...booking,
      reminderSentAt: new Date(sentAt),
    });
  }

  reset(): void {
    this.tenants.clear();
    this.bookings.clear();
    this.claims.clear();
  }
}

async function sendReminder(
  deps: ReminderDeps,
  booking: ReminderBooking,
  kind: ReminderKind,
  sentAt: Date
): Promise<ReminderSendResult> {
  const targetAt = reminderTargetAt(booking.startsAt, kind);

  if (deps.whatsapp) {
    const template = WHATSAPP_TEMPLATES.booking_reminder;
    const result = await deps.whatsapp.send({
      to: booking.clientPhone,
      content: {
        kind: "template",
        name: template.name,
        language: template.language,
        bodyParameters: [
          booking.clientName,
          booking.serviceName,
          booking.startsAt.toISOString(),
          booking.businessName,
        ],
      },
    });
    return {
      channel: "whatsapp",
      id: result.id,
      bookingId: booking.id,
      kind,
      targetAt,
      sentAt,
    };
  }

  if (deps.sms) {
    const result = await deps.sms.send({
      to: booking.clientPhone,
      body: buildSmsBody(booking, kind),
    });
    return {
      channel: "sms",
      id: result.id,
      bookingId: booking.id,
      kind,
      targetAt,
      sentAt,
    };
  }

  // No transport configured (dry-run / lock-only tests): still record a send id.
  return {
    channel: "sms",
    id: `dry-${booking.id}-${kind}`,
    bookingId: booking.id,
    kind,
    targetAt,
    sentAt,
  };
}

/**
 * Single cron tick: find due reminders and send at most once per (booking, kind).
 */
export async function runReminderPass(deps: ReminderDeps): Promise<ReminderPassSummary> {
  const now = deps.now ? deps.now() : new Date();
  const candidates = await deps.bookings.listDueCandidates({
    now,
    windowMs: REMINDER_DISPATCH_TOLERANCE_MS,
  });

  const sent: ReminderSendResult[] = [];
  let skipped = 0;

  for (const booking of candidates) {
    const tenant = await deps.bookings.getTenant(booking.tenantId);
    if (!tenant || !tenant.remindersEnabled) {
      skipped += 1;
      continue;
    }

    const kinds = dueReminderKinds(booking, now);
    for (const kind of kinds) {
      const lockKey = advisoryLockKey(`reminder:${booking.id}:${kind}`);
      const locked = await withAdvisoryLock(deps.locks ?? null, lockKey, async () => {
        if (await deps.claims.hasClaim(booking.id, kind)) {
          return null;
        }
        const claimed = await deps.claims.claim(booking.id, kind);
        if (!claimed) {
          return null;
        }

        const sentAt = deps.now ? deps.now() : new Date();
        const result = await sendReminder(deps, booking, kind, sentAt);
        await deps.bookings.markReminderSent(booking.id, sentAt);
        return result;
      });

      if (!locked.acquired || !locked.result) {
        skipped += 1;
        continue;
      }
      sent.push(locked.result);
    }
  }

  return { examined: candidates.length, sent, skipped };
}
