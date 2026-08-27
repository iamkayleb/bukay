export type BookingEmailContext = {
  tenantName: string;
  timezone: string;
  serviceName: string;
  staffName: string | null;
  clientName: string;
  clientEmail: string | null;
  startsAt: Date;
  previousStartsAt?: Date;
};

export type RenderedBookingEmail = {
  templateId: string;
  subject: string;
  html: string;
  text: string;
};

function formatLocalDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function staffClause(staffName: string | null): string {
  return staffName ? ` with ${staffName}` : "";
}

export function renderBookingConfirmedTemplate(ctx: BookingEmailContext): RenderedBookingEmail {
  const when = formatLocalDateTime(ctx.startsAt, ctx.timezone);
  const subject = `${ctx.tenantName}: your ${ctx.serviceName} booking is confirmed`;
  const body =
    `Your ${ctx.serviceName} appointment${staffClause(ctx.staffName)} at ${ctx.tenantName} ` +
    `is confirmed for ${when} (${ctx.timezone}).`;

  return {
    templateId: "booking-confirmed-v1",
    subject,
    text: `Hi ${ctx.clientName},\n\n${body}\n\nSee you then!`,
    html: `<p>Hi ${ctx.clientName},</p><p>${body}</p><p>See you then!</p>`,
  };
}

export function renderBookingRescheduledTemplate(ctx: BookingEmailContext): RenderedBookingEmail {
  const when = formatLocalDateTime(ctx.startsAt, ctx.timezone);
  const previousClause = ctx.previousStartsAt
    ? ` (previously ${formatLocalDateTime(ctx.previousStartsAt, ctx.timezone)})`
    : "";
  const subject = `${ctx.tenantName}: your ${ctx.serviceName} booking was rescheduled`;
  const body =
    `Your ${ctx.serviceName} appointment${staffClause(ctx.staffName)} at ${ctx.tenantName} ` +
    `has been rescheduled to ${when} (${ctx.timezone})${previousClause}.`;

  return {
    templateId: "booking-rescheduled-v1",
    subject,
    text: `Hi ${ctx.clientName},\n\n${body}`,
    html: `<p>Hi ${ctx.clientName},</p><p>${body}</p>`,
  };
}

export function renderBookingCancelledTemplate(ctx: BookingEmailContext): RenderedBookingEmail {
  const when = formatLocalDateTime(ctx.startsAt, ctx.timezone);
  const subject = `${ctx.tenantName}: your ${ctx.serviceName} booking was cancelled`;
  const body =
    `Your ${ctx.serviceName} appointment${staffClause(ctx.staffName)} at ${ctx.tenantName} ` +
    `scheduled for ${when} (${ctx.timezone}) has been cancelled.`;

  return {
    templateId: "booking-cancelled-v1",
    subject,
    text: `Hi ${ctx.clientName},\n\n${body}`,
    html: `<p>Hi ${ctx.clientName},</p><p>${body}</p>`,
  };
}
