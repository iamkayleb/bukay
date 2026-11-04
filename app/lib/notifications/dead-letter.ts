/**
 * Persist permanently failed lifecycle notifications to the shared DeadLetter table.
 *
 * Called only after WhatsApp and SMS have each exhausted their retry/backoff
 * attempts. Payload keeps a top-level bookingId so DLQ rows can be tied back
 * to the originating booking-triggered event without parsing nested fields.
 */

import { NOTIFICATION_DEAD_LETTER_SOURCE, type LifecycleNotificationEvent } from "./types";
import type { BackoffExhaustedError } from "./retry";

export type NotificationDeadLetterDb = {
  deadLetter: {
    create(args: {
      data: {
        tenantId?: string | null;
        source: string;
        eventType: string;
        payload: string;
        reason?: string | null;
      };
    }): Promise<unknown>;
  };
};

/** Stable JSON shape stored in `DeadLetter.payload` for notification failures. */
export type NotificationDeadLetterPayload = {
  bookingId: string;
  tenantId: string;
  eventType: LifecycleNotificationEvent["type"];
  to: string;
  /** Full lifecycle event used by the dispatcher. */
  event: LifecycleNotificationEvent;
};

export function buildNotificationDeadLetterPayload(
  event: LifecycleNotificationEvent
): NotificationDeadLetterPayload {
  return {
    bookingId: event.bookingId,
    tenantId: event.tenantId,
    eventType: event.type,
    to: event.to,
    event,
  };
}

function isBackoffExhaustedError(err: unknown): err is BackoffExhaustedError {
  return (
    typeof err === "object" &&
    err !== null &&
    "name" in err &&
    (err as { name?: string }).name === "BackoffExhaustedError"
  );
}

function describeChannelError(err: unknown): string {
  if (isBackoffExhaustedError(err)) {
    const last =
      err.lastError instanceof Error
        ? err.lastError.message
        : err.lastError != null
          ? String(err.lastError)
          : "unknown";
    return `exhausted ${err.attempts} attempts: ${last}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

/** Human-readable reason covering both channel failures after retries. */
export function formatPermanentFailureReason(whatsappError: unknown, smsError: unknown): string {
  return `whatsapp: ${describeChannelError(whatsappError)}; sms: ${describeChannelError(smsError)}`;
}

/**
 * Write exactly one DeadLetter row for a permanently failed notification.
 * Callers must invoke this only after both channel retry budgets are exhausted.
 */
export async function recordNotificationDeadLetter(
  db: NotificationDeadLetterDb,
  event: LifecycleNotificationEvent,
  reason: string
): Promise<void> {
  const payload = buildNotificationDeadLetterPayload(event);
  await db.deadLetter.create({
    data: {
      tenantId: event.tenantId,
      source: NOTIFICATION_DEAD_LETTER_SOURCE,
      eventType: event.type,
      payload: JSON.stringify(payload),
      reason,
    },
  });
}
