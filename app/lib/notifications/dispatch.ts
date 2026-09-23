import type { SmsProvider } from "@/app/lib/sms/provider";
import type { WhatsAppProvider } from "@/app/lib/whatsapp/provider";
import { WHATSAPP_TEMPLATES, type WhatsAppTemplateKey } from "@/app/lib/whatsapp/templates";
import {
  formatPermanentFailureReason,
  recordNotificationDeadLetter,
  type NotificationDeadLetterDb,
} from "./dead-letter";
import { withBackoff, type BackoffOptions } from "./retry";
import { type LifecycleEventType, type LifecycleNotificationEvent } from "./types";

export type { NotificationDeadLetterDb } from "./dead-letter";

export type DispatchChannel = "whatsapp" | "sms";

export type DispatchSuccess = {
  status: "sent";
  channel: DispatchChannel;
  provider: string;
  id: string;
};

export type DispatchDeadLettered = {
  status: "dead_lettered";
  reason: string;
};

export type DispatchResult = DispatchSuccess | DispatchDeadLettered;

export type DispatchDeps = {
  whatsapp: WhatsAppProvider;
  sms: SmsProvider;
  db: NotificationDeadLetterDb;
  backoff?: BackoffOptions;
};

const EVENT_TEMPLATE_KEY: Record<LifecycleEventType, WhatsAppTemplateKey> = {
  "booking.created": "booking_created",
  "booking.confirmed": "booking_confirmed",
  "booking.cancelled": "booking_cancelled",
  "booking.rescheduled": "booking_rescheduled",
};

export function templateKeyForEvent(type: LifecycleEventType): WhatsAppTemplateKey {
  return EVENT_TEMPLATE_KEY[type];
}

export function bodyParametersForEvent(event: LifecycleNotificationEvent): string[] {
  if (event.type === "booking.rescheduled") {
    return [
      event.clientName,
      event.serviceName,
      event.previousStartsAt ?? event.startsAt,
      event.startsAt,
      event.businessName,
    ];
  }
  return [event.clientName, event.serviceName, event.startsAt, event.businessName];
}

export function renderSmsBody(event: LifecycleNotificationEvent): string {
  const template = WHATSAPP_TEMPLATES[templateKeyForEvent(event.type)];
  const params = bodyParametersForEvent(event);
  return template.bodyExample.replace(/\{\{(\d+)\}\}/g, (_match, index: string) => {
    const value = params[Number(index) - 1];
    return value ?? "";
  });
}

/**
 * Send a lifecycle notification: WhatsApp first, SMS on WhatsApp failure.
 * Permanent failure of both channels (after each exhausts retry/backoff) writes
 * exactly one `DeadLetter` row with the notification payload and booking id.
 */
export async function dispatchLifecycleNotification(
  event: LifecycleNotificationEvent,
  deps: DispatchDeps
): Promise<DispatchResult> {
  const backoff = deps.backoff ?? {};

  try {
    const result = await withBackoff(
      () =>
        deps.whatsapp.send({
          to: event.to,
          content: {
            kind: "template",
            name: WHATSAPP_TEMPLATES[templateKeyForEvent(event.type)].name,
            language: WHATSAPP_TEMPLATES[templateKeyForEvent(event.type)].language,
            bodyParameters: bodyParametersForEvent(event),
          },
        }),
      backoff
    );
    return {
      status: "sent",
      channel: "whatsapp",
      provider: result.provider,
      id: result.id,
    };
  } catch (whatsappError) {
    try {
      const result = await withBackoff(
        () =>
          deps.sms.send({
            to: event.to,
            body: renderSmsBody(event),
          }),
        backoff
      );
      return {
        status: "sent",
        channel: "sms",
        provider: result.provider,
        id: result.id,
      };
    } catch (smsError) {
      const reason = formatPermanentFailureReason(whatsappError, smsError);
      await recordNotificationDeadLetter(deps.db, event, reason);
      return { status: "dead_lettered", reason };
    }
  }
}
