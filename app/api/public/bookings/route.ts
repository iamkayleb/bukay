import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import {
  isUniqueConstraintError,
  jsonError,
  readJson,
  validationError,
} from "@/app/api/services/_helpers";
import {
  blockingBookingWhere,
  validateBookingInterval,
  type BookingRecord,
  type BookingValidationStore,
  type BusinessHourRecord,
} from "@/services/bookingValidation";

export const dynamic = "force-dynamic";

const HOLD_DURATION_MS = 10 * 60 * 1000;
const NEW_BOOKING_VALIDATION_ID = "__new_public_booking__";
const NIGERIAN_PHONE_PATTERN = /^(?:\+?234|0)[789][01]\d{8}$/;

const bookingDateField = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date;
  },
  z.date({ invalid_type_error: "Must be a valid ISO date" })
);

const publicBookingSchema = z
  .object({
    tenantSlug: z.string().trim().min(1, "Tenant is required"),
    serviceId: z.string().trim().min(1, "Service is required"),
    startsAt: bookingDateField,
    endsAt: bookingDateField,
    client: z.object({
      name: z.string().trim().min(1, "Name is required"),
      phone: z
        .string()
        .trim()
        .regex(NIGERIAN_PHONE_PATTERN, "Enter a valid Nigerian phone number"),
      email: z.string().trim().email("Enter a valid email").nullable().optional(),
    }),
    notes: z.string().trim().nullable().optional(),
  })
  .strict();

type TransactionClient = {
  tenant: {
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
  service: {
    findFirst(args: unknown): Promise<{
      id: string;
      tenantId: string;
      durationMinutes: number;
    } | null>;
  };
  client: {
    upsert(args: unknown): Promise<{ id: string }>;
  };
  booking: {
    findMany(args: unknown): Promise<BookingRecord[]>;
    updateMany(args: unknown): Promise<{ count: number }>;
    create(args: unknown): Promise<BookingRecord>;
  };
  businessHour: {
    findFirst(args: unknown): Promise<BusinessHourRecord | null>;
  };
  blackoutDate?: {
    findFirst(args: unknown): Promise<unknown | null>;
  };
};

const prismaWithTransaction = prisma as unknown as {
  $transaction<T>(callback: (tx: TransactionClient) => Promise<T>): Promise<T>;
};

function buildValidationStore(tx: TransactionClient, now: Date): BookingValidationStore {
  return {
    async findBusinessHours({ tenantId, dayOfWeek }) {
      return tx.businessHour.findFirst({
        where: {
          tenantId,
          dayOfWeek,
        },
      });
    },
    async hasBlackoutDate({ tenantId, date, staffId }) {
      if (!tx.blackoutDate) {
        return false;
      }

      const blackoutDate = await tx.blackoutDate.findFirst({
        where: {
          tenantId,
          date,
          OR: staffId ? [{ staffId }, { staffId: null }] : [{ staffId: null }],
        },
      });

      return !!blackoutDate;
    },
    async findOverlappingBooking({ tenantId, bookingId, staffId, startsAt, endsAt }) {
      const overlappingBookings = await tx.booking.findMany({
        where: {
          tenantId,
          id: { not: bookingId },
          staffId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          ...blockingBookingWhere(now),
        },
        take: 1,
      });

      return overlappingBookings[0] ?? null;
    },
  };
}

function buildPublicSlotHoldKey(tenantId: string, startsAt: Date, endsAt: Date) {
  return [tenantId, "public", startsAt.toISOString(), endsAt.toISOString()].join(":");
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = publicBookingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const now = new Date();
  const holdExpiresAt = new Date(now.getTime() + HOLD_DURATION_MS);
  const payload = parsed.data;

  return prismaWithTransaction.$transaction(async (tx) => {
    const tenant = await tx.tenant.findUnique({
      where: { slug: payload.tenantSlug },
      select: { id: true },
    });
    if (!tenant) {
      return jsonError("tenant_not_found", 404);
    }

    const service = await tx.service.findFirst({
      where: { tenantId: tenant.id, id: payload.serviceId, active: true },
      select: { id: true, tenantId: true, durationMinutes: true },
    });
    if (!service) {
      return jsonError("service_not_found", 404);
    }

    await tx.booking.updateMany({
      where: {
        tenantId: tenant.id,
        status: "pending_payment",
        isSlotHold: true,
        holdExpiresAt: { lte: now },
        slotHoldKey: { not: null },
      },
      data: { slotHoldKey: null },
    });

    const expectedEndsAt = new Date(payload.startsAt.getTime() + service.durationMinutes * 60_000);
    if (expectedEndsAt.getTime() !== payload.endsAt.getTime()) {
      return jsonError("invalid_service_duration", 422);
    }

    const validationIssue = await validateBookingInterval(
      buildValidationStore(tx, now),
      {
        id: NEW_BOOKING_VALIDATION_ID,
        tenantId: tenant.id,
        staffId: null,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
      },
      {
        staffId: null,
        startsAt: payload.startsAt,
        endsAt: payload.endsAt,
      },
      now
    );
    if (validationIssue) {
      return NextResponse.json(
        {
          ok: false,
          error: validationIssue.code,
          message: validationIssue.message,
        },
        { status: validationIssue.status }
      );
    }

    const client = await tx.client.upsert({
      where: {
        tenantId_phone: {
          tenantId: tenant.id,
          phone: payload.client.phone,
        },
      },
      update: {
        name: payload.client.name,
        email: payload.client.email ?? null,
      },
      create: {
        tenantId: tenant.id,
        name: payload.client.name,
        phone: payload.client.phone,
        email: payload.client.email ?? null,
      },
    });

    let booking: BookingRecord;
    try {
      booking = await tx.booking.create({
        data: {
          tenantId: tenant.id,
          clientId: client.id,
          serviceId: service.id,
          startsAt: payload.startsAt,
          endsAt: payload.endsAt,
          status: "pending_payment",
          isSlotHold: true,
          holdExpiresAt,
          slotHoldKey: buildPublicSlotHoldKey(tenant.id, payload.startsAt, payload.endsAt),
          notes: payload.notes ?? null,
        },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json(
          {
            ok: false,
            error: "BOOKING_OVERLAP",
            message: "Booking overlaps with another booking for the selected time.",
          },
          { status: 409 }
        );
      }

      throw error;
    }

    return NextResponse.json(
      {
        ok: true,
        booking: serializePublicBooking(booking),
        holdExpiresAt: holdExpiresAt.toISOString(),
      },
      { status: 201 }
    );
  });
}

function serializePublicBooking(booking: BookingRecord) {
  return {
    id: booking.id,
    tenantId: booking.tenantId,
    clientId: booking.clientId,
    serviceId: booking.serviceId,
    staffId: booking.staffId,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    status: booking.status,
    isSlotHold: booking.isSlotHold ?? false,
    holdExpiresAt: booking.holdExpiresAt?.toISOString() ?? null,
    notes: booking.notes,
    createdAt: booking.createdAt?.toISOString(),
    updatedAt: booking.updatedAt?.toISOString(),
  };
}
