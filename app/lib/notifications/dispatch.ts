import type { SmsProvider } from "../sms/provider";
import type { WhatsAppProvider } from "../whatsapp/provider";
import type { WhatsAppTemplateName } from "../whatsapp/templates";
import { RetryExhaustedError, RetryOptions, withRetry } from "./retry";
import type { BookingLifecycleEvent, BookingLifecycleEventType } from "./subscribers";

export type NotificationChannel = "whatsapp" | "sms";

/** Recorded for a message that failed on every channel. */
export type DeadLetterRecord = {
  tenantId: string;
  bookingId: string;
  eventType: BookingLifecycleEventType;
  to: string;
  /** Serialized event payload. */
  payload: string;
  reason: string;
  attempts: number;
};

export type DispatchResult =
  | { status: "sent"; channel: NotificationChannel; fellBack: boolean; messageId: string }
  | { status: "dead-lettered"; reason: string };

export type DispatcherDeps = {
  whatsapp: WhatsAppProvider;
  sms: SmsProvider;
  /** Persists permanently failed messages (see `DeadLetter` in the Prisma schema). */
  deadLetter: (record: DeadLetterRecord) => Promise<void>;
  retry?: RetryOptions;
};

// Approved templates cover confirmation and cancellation only; created and rescheduled reuse the
// confirmation template, which carries the (new) start time. The SMS body is event-specific.
const TEMPLATE_BY_EVENT: Record<BookingLifecycleEventType, WhatsAppTemplateName> = {
  created: "booking_confirmation",
  confirmed: "booking_confirmation",
  rescheduled: "booking_confirmation",
  cancelled: "booking_cancellation",
};

function formatWhen(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export function whatsappParams(event: BookingLifecycleEvent): Record<string, string> {
  return {
    customerName: event.customerName,
    serviceName: event.serviceName,
    businessName: event.businessName,
    startsAt: formatWhen(event.startsAt),
  };
}

export function smsBody(event: BookingLifecycleEvent): string {
  const { customerName: name, serviceName: service, businessName: biz } = event;
  switch (event.type) {
    case "created":
      return `Hi ${name}, we received your ${service} booking with ${biz} for ${formatWhen(event.startsAt)}.`;
    case "confirmed":
      return `Hi ${name}, your ${service} booking with ${biz} is confirmed for ${formatWhen(event.startsAt)}.`;
    case "rescheduled":
      return `Hi ${name}, your ${service} booking with ${biz} moved to ${formatWhen(event.startsAt)}.`;
    case "cancelled":
      return `Hi ${name}, your ${service} booking with ${biz} has been cancelled.`;
  }
}

function describe(error: unknown): { reason: string; attempts: number } {
  if (error instanceof RetryExhaustedError) {
    return {
      reason: (error.cause as Error)?.message ?? String(error.cause),
      attempts: error.attempts,
    };
  }
  return { reason: error instanceof Error ? error.message : String(error), attempts: 1 };
}

/**
 * Sends a lifecycle message over WhatsApp (with retries). If WhatsApp ultimately fails, falls back
 * to SMS (with retries). If both fail, the message is recorded as a dead letter.
 */
export function createDispatcher(deps: DispatcherDeps) {
  return async function dispatch(event: BookingLifecycleEvent): Promise<DispatchResult> {
    let waFailure: { reason: string; attempts: number };
    try {
      const sent = await withRetry(
        () =>
          deps.whatsapp.sendTemplate({
            to: event.to,
            template: TEMPLATE_BY_EVENT[event.type],
            params: whatsappParams(event),
          }),
        deps.retry
      );
      return { status: "sent", channel: "whatsapp", fellBack: false, messageId: sent.id };
    } catch (error) {
      waFailure = describe(error);
    }

    try {
      const sent = await withRetry(
        () => deps.sms.send({ to: event.to, body: smsBody(event) }),
        deps.retry
      );
      return { status: "sent", channel: "sms", fellBack: true, messageId: sent.id };
    } catch (error) {
      const smsFailure = describe(error);
      const reason = `whatsapp: ${waFailure.reason}; sms: ${smsFailure.reason}`;
      await deps.deadLetter({
        tenantId: event.tenantId,
        bookingId: event.bookingId,
        eventType: event.type,
        to: event.to,
        payload: JSON.stringify(event),
        reason,
        attempts: waFailure.attempts + smsFailure.attempts,
      });
      return { status: "dead-lettered", reason };
    }
  };
}

/** Wires the dispatcher to all four lifecycle events. Returns an unsubscribe function. */
export function subscribeDispatcher(
  subscribeAll: (handler: (event: BookingLifecycleEvent) => Promise<void>) => () => void,
  dispatch: (event: BookingLifecycleEvent) => Promise<DispatchResult>
): () => void {
  return subscribeAll(async (event) => {
    await dispatch(event);
  });
}
