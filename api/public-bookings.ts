import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { jsonError, readJson, runForTenant, validationError } from "@/app/api/services/_helpers";
import { bookingClientDetailsSchema } from "@/app/lib/public-booking/schemas";
import {
  validateBookingInterval,
  type BookingRecord,
  type BookingValidationStore,
  type BusinessHourRecord,
} from "@/services/bookingValidation";

export const dynamic = "force-dynamic";

type ServiceRecord = {
  id: string;
  tenantId: string;
  durationMinutes: number;
  active: boolean;
};

type ClientRecord = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
};

type CreatedBookingRecord = BookingRecord & {
  clientId: string;
  serviceId: string;
  status: string;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
};

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

const publicBookingSchema = bookingClientDetailsSchema
  .extend({
    serviceId: z.string().trim().min(1, "Service is required"),
    staffId: z.string().trim().min(1, "Staff is required").nullable().optional(),
    startsAt: bookingDateField,
    notes: z.string().trim().max(1000, "Notes must be 1000 characters or fewer").optional(),
  })
  .strict();

const serviceDelegate = prisma.service as unknown as {
  findFirst(args: unknown): Promise<ServiceRecord | null>;
};

const clientDelegate = prisma.client as unknown as {
  upsert(args: unknown): Promise<ClientRecord>;
};

const bookingDelegate = prisma.booking as unknown as {
  findMany(args: unknown): Promise<BookingRecord[]>;
  create(args: unknown): Promise<CreatedBookingRecord>;
};

const businessHourDelegate = prisma.businessHour as unknown as {
  findFirst(args: unknown): Promise<BusinessHourRecord | null>;
};

const blackoutDateDelegate = (
  prisma as unknown as {
    blackoutDate?: {
      findFirst(args: unknown): Promise<unknown | null>;
    };
  }
).blackoutDate;

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = publicBookingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    const service = await serviceDelegate.findFirst({
      where: {
        tenantId,
        id: parsed.data.serviceId,
        active: true,
      },
    });

    if (!service) {
      return jsonError("service_not_found", 404);
    }

    const startsAt = parsed.data.startsAt;
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const staffId = parsed.data.staffId ?? null;
    const pendingBooking = {
      id: "__new_public_booking__",
      tenantId,
      staffId,
      startsAt,
      endsAt,
    };

    const validationIssue = await validateBookingInterval(buildValidationStore(), pendingBooking, {
      startsAt,
      endsAt,
      staffId,
    });

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

    const client = await clientDelegate.upsert({
      where: {
        tenantId_phone: {
          tenantId,
          phone: parsed.data.phone,
        },
      },
      create: {
        tenantId,
        name: parsed.data.name,
        phone: parsed.data.phone,
      },
      update: {
        name: parsed.data.name,
      },
    });
    const booking = await bookingDelegate.create({
      data: {
        tenantId,
        clientId: client.id,
        serviceId: service.id,
        staffId,
        startsAt,
        endsAt,
        status: "pending_payment",
        notes: parsed.data.notes ?? null,
      },
    });

    return NextResponse.json({ ok: true, booking: serializeBooking(booking) }, { status: 201 });
  });
}

function buildValidationStore(): BookingValidationStore {
  return {
    async findBusinessHours({ tenantId, dayOfWeek }) {
      return businessHourDelegate.findFirst({
        where: {
          tenantId,
          dayOfWeek,
        },
      });
    },
    async hasBlackoutDate({ tenantId, date, staffId }) {
      if (!blackoutDateDelegate) {
        return false;
      }

      const blackoutDate = await blackoutDateDelegate.findFirst({
        where: {
          tenantId,
          date,
          OR: staffId ? [{ staffId }, { staffId: null }] : [{ staffId: null }],
        },
      });

      return !!blackoutDate;
    },
    async findOverlappingBooking({ tenantId, bookingId, staffId, startsAt, endsAt }) {
      const overlappingBookings = await bookingDelegate.findMany({
        where: {
          tenantId,
          id: { not: bookingId },
          staffId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        take: 1,
      });

      return overlappingBookings[0] ?? null;
    },
  };
}

function serializeBooking(booking: CreatedBookingRecord) {
  return {
    ...booking,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    createdAt: booking.createdAt.toISOString(),
    updatedAt: booking.updatedAt.toISOString(),
  };
}
