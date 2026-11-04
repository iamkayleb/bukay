/**
 * Booking lifecycle notification events.
 *
 * Merchants get WhatsApp (SMS fallback) on create, confirm, cancel, and
 * reschedule. Reminder timing lives elsewhere; this module owns the four
 * status transitions.
 */

export const LIFECYCLE_EVENT_TYPES = [
  "booking.created",
  "booking.confirmed",
  "booking.cancelled",
  "booking.rescheduled",
] as const;

export type LifecycleEventType = (typeof LIFECYCLE_EVENT_TYPES)[number];

export type LifecycleNotificationEvent = {
  type: LifecycleEventType;
  bookingId: string;
  tenantId: string;
  /** Recipient phone in E.164. */
  to: string;
  clientName: string;
  serviceName: string;
  businessName: string;
  /** ISO-8601 start time shown in the message. */
  startsAt: string;
  /** Previous start time; required for `booking.rescheduled`. */
  previousStartsAt?: string;
};

export const NOTIFICATION_DEAD_LETTER_SOURCE = "notifications";
