/**
 * Emit booking lifecycle notification events from real booking handlers.
 *
 * Handlers pass the booking row plus related client/service/tenant fields;
 * this module builds the LifecycleNotificationEvent and publishes it on the
 * in-process bus (see subscribers.ts). Delivery (WhatsApp/SMS/DLQ) is owned
 * by registerNotificationSubscribers + dispatch.
 */

import { prisma } from "@/app/db/prisma";
import { emitLifecycleEvent } from "./subscribers";
import type { LifecycleEventType, LifecycleNotificationEvent } from "./types";

export type BookingLifecycleBooking = {
  id: string;
  tenantId: string;
  clientId: string;
  serviceId: string;
  startsAt: Date;
};

export type BookingLifecycleLookupDb = {
  client: {
    findFirst(args: {
      where: { tenantId: string; id: string };
      select: { name: true; phone: true };
    }): Promise<{ name: string; phone: string } | null>;
  };
  service: {
    findFirst(args: {
      where: { tenantId: string; id: string };
      select: { name: true };
    }): Promise<{ name: string } | null>;
  };
  tenant: {
    findUnique(args: {
      where: { id: string };
      select: { name: true };
    }): Promise<{ name: string } | null>;
  };
};

export type EmitBookingLifecycleOptions = {
  type: LifecycleEventType;
  booking: BookingLifecycleBooking;
  /** Previous start time; required for `booking.rescheduled`. */
  previousStartsAt?: Date;
  db?: BookingLifecycleLookupDb;
};

/**
 * Resolve client/service/tenant display fields and emit one lifecycle event.
 * No-ops (without throwing) when the client has no phone — callers still
 * succeed the booking mutation.
 */
export async function emitBookingLifecycleNotification(
  options: EmitBookingLifecycleOptions
): Promise<LifecycleNotificationEvent | null> {
  const db = options.db ?? (prisma as unknown as BookingLifecycleLookupDb);
  const { booking, type, previousStartsAt } = options;

  const [client, service, tenant] = await Promise.all([
    db.client.findFirst({
      where: { tenantId: booking.tenantId, id: booking.clientId },
      select: { name: true, phone: true },
    }),
    db.service.findFirst({
      where: { tenantId: booking.tenantId, id: booking.serviceId },
      select: { name: true },
    }),
    db.tenant.findUnique({
      where: { id: booking.tenantId },
      select: { name: true },
    }),
  ]);

  const to = client?.phone?.trim() ?? "";
  if (!to || !client || !service || !tenant) {
    return null;
  }

  const event: LifecycleNotificationEvent = {
    type,
    bookingId: booking.id,
    tenantId: booking.tenantId,
    to,
    clientName: client.name,
    serviceName: service.name,
    businessName: tenant.name,
    startsAt: booking.startsAt.toISOString(),
    ...(type === "booking.rescheduled"
      ? {
          previousStartsAt: (previousStartsAt ?? booking.startsAt).toISOString(),
        }
      : {}),
  };

  emitLifecycleEvent(event);
  return event;
}

/**
 * Decide which single lifecycle notification to emit after a booking PATCH.
 * Cancel wins over confirm/reschedule; otherwise confirm; otherwise reschedule
 * when startsAt moved. Returns null when the update is not a notifiable
 * lifecycle transition.
 */
export function lifecycleEventTypeForBookingUpdate(args: {
  previousStatus: string;
  nextStatus: string;
  previousStartsAt: Date;
  nextStartsAt: Date;
}): LifecycleEventType | null {
  const cancelled = args.nextStatus === "cancelled" && args.previousStatus !== "cancelled";
  if (cancelled) return "booking.cancelled";

  const confirmed = args.nextStatus === "confirmed" && args.previousStatus !== "confirmed";
  if (confirmed) return "booking.confirmed";

  if (args.nextStartsAt.getTime() !== args.previousStartsAt.getTime()) {
    return "booking.rescheduled";
  }

  return null;
}
