import { randomUUID } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { jsonError, readJson, validationError } from "@/app/api/services/_helpers";
import { InvalidPhoneNumberError, validateNigerianPhone } from "@/app/lib/phone";
import { getSlotHoldStore } from "@/app/lib/slot-hold";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const dynamic = "force-dynamic";

export const PUBLIC_BOOKING_STATUS = "pending_payment" as const;

const createPublicBookingSchema = z
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
 * Create a public booking with a 10-minute slot hold.
 * Exported for the book page server action and tests.
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
    const startsAtIso = startsAt.toISOString();
    const holdKey = {
      tenantId: tenant.id,
      serviceId: service.id,
      startsAt: startsAtIso,
    };

    const holdStore = getSlotHoldStore();
    const hold = holdStore.tryAcquire(holdKey, sessionId);
    if (!hold.ok) {
      return {
        ok: false as const,
        status: 409,
        error: "slot_held",
        message: "This time slot is held by another session",
        holdExpiresAt: new Date(hold.expiresAt).toISOString(),
      };
    }

    // A successful acquire after expiry means prior pending rows for this slot
    // are abandoned — cancel them so the slot can be rebooked.
    await prisma.booking.updateMany({
      where: {
        tenantId: tenant.id,
        serviceId: service.id,
        startsAt,
        status: PUBLIC_BOOKING_STATUS,
      },
      data: { status: "cancelled" },
    });

    const overlapping = await prisma.booking.findMany({
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
      holdStore.release(holdKey);
      return {
        ok: false as const,
        status: 409,
        error: "slot_unavailable",
        message: "This time slot is no longer available",
      };
    }

    const customerName = input.customerName.trim();
    let client = await prisma.client.findFirst({
      where: { tenantId: tenant.id, phone },
    });

    if (!client) {
      client = await prisma.client.create({
        data: {
          tenantId: tenant.id,
          name: customerName,
          phone,
        },
      });
    }

    const booking = (await prisma.booking.create({
      data: {
        tenantId: tenant.id,
        clientId: client.id,
        serviceId: service.id,
        startsAt,
        endsAt,
        status: PUBLIC_BOOKING_STATUS,
        notes: input.notes?.trim() || null,
      },
    })) as BookingRow;

    holdStore.tryAcquire(holdKey, sessionId, { bookingId: booking.id });

    return {
      ok: true as const,
      status: 201,
      booking: serializeBooking(booking),
      sessionId,
      holdExpiresAt: new Date(hold.expiresAt).toISOString(),
    };
  });
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = createPublicBookingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const sessionFromHeader = req.headers.get("x-booking-session")?.trim();
  const result = await createPublicBooking({
    ...parsed.data,
    sessionId: parsed.data.sessionId ?? sessionFromHeader ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        message: "message" in result ? result.message : undefined,
        holdExpiresAt: "holdExpiresAt" in result ? result.holdExpiresAt : undefined,
      },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      booking: result.booking,
      sessionId: result.sessionId,
      holdExpiresAt: result.holdExpiresAt,
    },
    { status: 201 }
  );
}
