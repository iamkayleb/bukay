import { randomUUID } from "node:crypto";

import { z } from "zod";

import { isUniqueConstraintError } from "@/app/api/services/_helpers";
import { prisma } from "@/app/db/prisma";
import { InvalidPhoneNumberError, validateNigerianPhone } from "@/app/lib/phone";
import {
  attachBookingToHold,
  bookingSlotLock,
  currentHoldTime,
  releaseExpiredHolds,
  releaseHold,
  tryAcquireHold,
} from "@/app/lib/slot-hold";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { emitLifecycleEvent } from "@/app/lib/notifications/subscribers";

export const PUBLIC_BOOKING_STATUS = "pending_payment" as const;

export const createPublicBookingSchema = z
  .object({
    slug: z.string().trim().min(1, "slug is required"),
    serviceId: z.string().trim().min(1, "serviceId is required"),
    startsAt: z.string().trim().min(1, "startsAt is required"),
    customerName: z.string().trim().min(1, "customerName is required"),
    phone: z.string().trim().min(1, "phone is required"),
    sessionId: z.string().trim().min(1).optional(),
    notes: z.string().trim().optional(),
  })
  .strict();

export type CreatePublicBookingInput = z.infer<typeof createPublicBookingSchema>;

type BookingRow = {
  id: string;
  tenantId: string;
  clientId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

class SlotConflictError extends Error {
  readonly status = 409 as const;
  readonly error: string;
  readonly holdExpiresAt?: string;

  constructor(error: string, message: string, holdExpiresAt?: string) {
    super(message);
    this.name = "SlotConflictError";
    this.error = error;
    this.holdExpiresAt = holdExpiresAt;
  }
}

function serializeBooking(booking: BookingRow) {
  return {
    id: booking.id,
    tenantId: booking.tenantId,
    clientId: booking.clientId,
    serviceId: booking.serviceId,
    staffId: booking.staffId,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    status: booking.status,
    notes: booking.notes,
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}

/**
 * Create a public booking with a durable 10-minute slot hold.
 * Hold cleanup, conflict checks, hold acquisition, and booking insert run in
 * one Prisma transaction.
 */
export async function createPublicBooking(input: CreatePublicBookingInput) {
  const slug = input.slug.trim().toLowerCase();
  const sessionId = input.sessionId?.trim() || randomUUID();

  let phone: string;
  try {
    phone = validateNigerianPhone(input.phone);
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return {
        ok: false as const,
        status: 422,
        error: "invalid_phone",
        message: error.message,
      };
    }
    throw error;
  }

  const startsAt = new Date(input.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return {
      ok: false as const,
      status: 422,
      error: "invalid_starts_at",
      message: "startsAt must be a valid ISO date",
    };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true, currency: true, timezone: true },
  });

  if (!tenant) {
    return { ok: false as const, status: 404, error: "tenant_not_found" };
  }

  return runWithTenantContext({ tenantId: tenant.id }, async () => {
    const service = await prisma.service.findFirst({
      where: { tenantId: tenant.id, id: input.serviceId, active: true },
    });

    if (!service) {
      return { ok: false as const, status: 404, error: "service_not_found" };
    }

    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const holdKey = {
      tenantId: tenant.id,
      serviceId: service.id,
      startsAt,
    };
    const slotLock = bookingSlotLock(service.id, startsAt);
    const customerName = input.customerName.trim();

    try {
      const result = await prisma.$transaction(async (tx) => {
        const now = currentHoldTime();

        // Expired-hold cleanup before availability / conflict checks.
        await releaseExpiredHolds(tx, tenant.id, now);

        const hold = await tryAcquireHold(tx, holdKey, sessionId, { now });
        if (!hold.ok) {
          throw new SlotConflictError(
            "slot_held",
            "This time slot is held by another session",
            hold.expiresAt.toISOString()
          );
        }

        // Abandoned pending_payment rows from an expired prior hold can be
        // replaced once this session owns the slot.
        await tx.booking.updateMany({
          where: {
            tenantId: tenant.id,
            serviceId: service.id,
            startsAt,
            status: PUBLIC_BOOKING_STATUS,
          },
          data: { status: "cancelled", slotLock: null },
        });

        const overlapping = await tx.booking.findMany({
          where: {
            tenantId: tenant.id,
            serviceId: service.id,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
            status: { not: "cancelled" },
          },
          take: 1,
        });

        if (overlapping.length > 0) {
          await releaseHold(tx, holdKey);
          throw new SlotConflictError("slot_unavailable", "This time slot is no longer available");
        }

        let client = await tx.client.findFirst({
          where: { tenantId: tenant.id, phone },
        });

        if (!client) {
          client = await tx.client.create({
            data: {
              tenantId: tenant.id,
              name: customerName,
              phone,
            },
          });
        }

        const booking = (await tx.booking.create({
          data: {
            tenantId: tenant.id,
            clientId: client.id,
            serviceId: service.id,
            startsAt,
            endsAt,
            status: PUBLIC_BOOKING_STATUS,
            notes: input.notes?.trim() || null,
            slotLock,
          },
        })) as BookingRow;

        await attachBookingToHold(tx, holdKey, sessionId, booking.id, now);

        return {
          booking,
          holdExpiresAt: hold.expiresAt.toISOString(),
          serviceName: service.name,
          clientName: client.name,
          clientPhone: client.phone,
        };
      });

      emitLifecycleEvent({
        type: "booking.created",
        bookingId: result.booking.id,
        tenantId: tenant.id,
        to: result.clientPhone,
        clientName: result.clientName,
        serviceName: result.serviceName,
        businessName: tenant.name,
        startsAt: result.booking.startsAt.toISOString(),
      });

      return {
        ok: true as const,
        status: 201,
        booking: serializeBooking(result.booking),
        sessionId,
        holdExpiresAt: result.holdExpiresAt,
      };
    } catch (error) {
      if (error instanceof SlotConflictError) {
        return {
          ok: false as const,
          status: 409 as const,
          error: error.error,
          message: error.message,
          holdExpiresAt: error.holdExpiresAt,
        };
      }

      if (isUniqueConstraintError(error)) {
        return {
          ok: false as const,
          status: 409 as const,
          error: "slot_unavailable",
          message: "This time slot is no longer available",
        };
      }

      throw error;
    }
  });
}
