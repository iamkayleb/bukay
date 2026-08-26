import { getEmailProvider } from "./from-env";
import {
  renderBookingCancelledTemplate,
  renderBookingConfirmedTemplate,
  renderBookingRescheduledTemplate,
  type BookingEmailContext,
  type RenderedBookingEmail,
} from "./templates";

export type BookingNotificationKind = "confirmed" | "rescheduled" | "cancelled";

export type BookingNotificationOutcome = "sent" | "skipped" | "failed";

export type AuditLogWriter = {
  create(args: { data: Record<string, unknown> }): Promise<unknown>;
};

export type BookingNotificationResult = {
  outcome: BookingNotificationOutcome;
  templateId: string;
};

function renderForKind(
  kind: BookingNotificationKind,
  context: BookingEmailContext,
): RenderedBookingEmail {
  if (kind === "confirmed") return renderBookingConfirmedTemplate(context);
  if (kind === "rescheduled") return renderBookingRescheduledTemplate(context);
  return renderBookingCancelledTemplate(context);
}

/**
 * Renders the template for the given transition, attempts the send via the
 * configured email provider (a no-op by default), and always records one
 * AuditLog row with the outcome and template id — even when no send is
 * attempted because the client has no email on file.
 */
export async function sendBookingNotification(params: {
  kind: BookingNotificationKind;
  tenantId: string;
  actorId: string | null;
  bookingId: string;
  context: BookingEmailContext;
  auditLog: AuditLogWriter;
}): Promise<BookingNotificationResult> {
  const { kind, tenantId, actorId, bookingId, context, auditLog } = params;
  const rendered = renderForKind(kind, context);

  let outcome: BookingNotificationOutcome;
  let errorMessage: string | undefined;

  if (!context.clientEmail) {
    outcome = "skipped";
  } else {
    try {
      await getEmailProvider().send({
        to: context.clientEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });
      outcome = "sent";
    } catch (error) {
      outcome = "failed";
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  await auditLog.create({
    data: {
      tenantId,
      actorId,
      action: "booking_email_send_attempted",
      entityType: "Booking",
      entityId: bookingId,
      metadata: JSON.stringify({
        kind,
        templateId: rendered.templateId,
        outcome,
        to: context.clientEmail,
        ...(errorMessage ? { error: errorMessage } : {}),
      }),
    },
  });

  return { outcome, templateId: rendered.templateId };
}
