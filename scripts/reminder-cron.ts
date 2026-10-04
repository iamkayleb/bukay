// Booking reminder job. Runs every 5 minutes and sends the T-24h and T-2h
// reminders for each booking. Storage, locking and delivery are injected so the
// cycle logic stays testable and the same code path serves any worker.
//
// A reminder is due once `now` reaches (startsAt - offset) and stays due for
// one tick interval. That keeps dispatch within 5 minutes of the target time;
// a reminder missed by a longer outage is skipped rather than sent late.
//
// Duplicate safety lives in `ReminderStore.claim`, which must atomically
// record that (booking, kind) was sent and return false for every caller but
// the first, so parallel workers send exactly one reminder.

import type { SmsProvider } from "@/app/lib/sms";

export const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

export const REMINDER_KINDS = [
  { kind: "t-24h", offsetMs: 24 * 60 * 60 * 1000 },
  { kind: "t-2h", offsetMs: 2 * 60 * 60 * 1000 },
] as const;

export type ReminderKind = (typeof REMINDER_KINDS)[number]["kind"];

export type ReminderCandidate = {
  bookingId: string;
  tenantId: string;
  clientPhone: string;
  clientName: string;
  serviceName: string;
  startsAt: Date;
};

export interface ReminderStore {
  /** Confirmed bookings starting within `[from, to]` whose tenant has reminders enabled. */
  findCandidates(from: Date, to: Date): Promise<ReminderCandidate[]>;
  /** Atomically marks (booking, kind) as sent. Returns true only for the first caller. */
  claim(bookingId: string, kind: ReminderKind, now: Date): Promise<boolean>;
  /** Releases a claim after a failed send so the next tick can retry. */
  release(bookingId: string, kind: ReminderKind): Promise<void>;
}

export type ReminderCycleResult = {
  sent: number;
  skipped: number;
  failed: number;
};

/** Returns the reminder kind due for a booking at `now`, if any. */
export function dueReminderKind(
  startsAt: Date,
  now: Date,
  intervalMs: number = REMINDER_INTERVAL_MS
): ReminderKind | null {
  const untilStart = startsAt.getTime() - now.getTime();
  if (untilStart <= 0) return null;
  for (const { kind, offsetMs } of REMINDER_KINDS) {
    const lateness = offsetMs - untilStart;
    if (lateness >= 0 && lateness < intervalMs) return kind;
  }
  return null;
}

export function reminderMessage(candidate: ReminderCandidate, kind: ReminderKind): string {
  const when = kind === "t-24h" ? "tomorrow" : "in about 2 hours";
  return (
    `Hi ${candidate.clientName}, reminder: your ${candidate.serviceName} booking is ` +
    `${when} (${candidate.startsAt.toISOString()}).`
  );
}

export async function runReminderCycle(deps: {
  store: ReminderStore;
  sms: SmsProvider;
  now?: Date;
  intervalMs?: number;
}): Promise<ReminderCycleResult> {
  const now = deps.now ?? new Date();
  const intervalMs = deps.intervalMs ?? REMINDER_INTERVAL_MS;
  const result: ReminderCycleResult = { sent: 0, skipped: 0, failed: 0 };

  const maxOffset = Math.max(...REMINDER_KINDS.map((k) => k.offsetMs));
  const candidates = await deps.store.findCandidates(now, new Date(now.getTime() + maxOffset));

  for (const candidate of candidates) {
    const kind = dueReminderKind(candidate.startsAt, now, intervalMs);
    if (!kind) continue;

    if (!(await deps.store.claim(candidate.bookingId, kind, now))) {
      result.skipped += 1;
      continue;
    }

    try {
      await deps.sms.send({
        to: candidate.clientPhone,
        body: reminderMessage(candidate, kind),
      });
      result.sent += 1;
    } catch (error) {
      await deps.store.release(candidate.bookingId, kind);
      result.failed += 1;
      console.error(`reminder ${kind} failed for booking ${candidate.bookingId}`, error);
    }
  }

  return result;
}

/** Runs a cycle immediately, then every 5 minutes. Returns a stop function. */
export function startReminderCron(
  deps: { store: ReminderStore; sms: SmsProvider },
  intervalMs: number = REMINDER_INTERVAL_MS
): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runReminderCycle({ ...deps, intervalMs });
    } catch (error) {
      console.error("reminder cycle failed", error);
    } finally {
      running = false;
    }
  };
  void tick();
  const timer = setInterval(tick, intervalMs);
  return () => clearInterval(timer);
}
