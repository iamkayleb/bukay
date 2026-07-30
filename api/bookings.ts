import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import {
  isMissingRecordError,
  jsonError,
  readJson,
  runForTenant,
  validationError,
} from "@/app/api/services/_helpers";
import {
  mergeBookingInterval,
  validateBookingInterval,
  type BookingRecord,
  type BookingValidationStore,
  type BusinessHourRecord,
} from "@/services/bookingValidation";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

type BookingUpdateData = {
  startsAt?: Date;
  endsAt?: Date;
  staffId?: string | null;
  status?: string;
  notes?: string | null;
};

type BookingCreateData = {
  tenantId: string;
  clientId: string;
  serviceId: string;
  staffId?: string | null;
  startsAt: Date;
  endsAt: Date;
  status: string;
  notes?: string | null;
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

const updateBookingSchema = z
  .object({
    startsAt: bookingDateField.optional(),
    endsAt: bookingDateField.optional(),
    staffId: z.string().trim().min(1, "Staff is required").nullable().optional(),
    status: z.string().trim().min(1, "Status is required").optional(),
    notes: z.string().nullable().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one booking field is required",
    path: ["_form"],
  });

const createBookingSchema = z
  .object({
    clientId: z.string().trim().min(1, "Client is required"),
    serviceId: z.string().trim().min(1, "Service is required"),
    staffId: z.string().trim().min(1, "Staff is required").nullable().optional(),
    startsAt: bookingDateField,
    endsAt: bookingDateField,
    status: z.string().trim().min(1, "Status is required").default("confirmed"),
    notes: z.string().nullable().optional(),
  })
  .strict();

const bookingDelegate = prisma.booking as unknown as {
  findFirst(args: unknown): Promise<BookingRecord | null>;
  findMany(args: unknown): Promise<BookingRecord[]>;
  create(args: unknown): Promise<BookingRecord>;
  update(args: unknown): Promise<BookingRecord>;
};

type BookingWriteClient = {
  booking: {
    create(args: unknown): Promise<BookingRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

const transactionalPrisma = prisma as unknown as {
  $transaction<T>(callback: (tx: BookingWriteClient) => Promise<T>): Promise<T>;
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

async function findTenantBooking(tenantId: string, id: string) {
  return bookingDelegate.findFirst({
    where: { tenantId, id },
  });
}

function isBookingOverlapError(error: unknown) {
  return error instanceof Error && error.message.includes("booking_staff_overlap");
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

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const bookings = await bookingDelegate.findMany({
      where: { tenantId },
      orderBy: [{ startsAt: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ ok: true, bookings: bookings.map(serializeBooking) });
  });
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = createBookingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    const candidate: BookingCreateData = {
      tenantId,
      ...parsed.data,
      staffId: parsed.data.staffId ?? null,
      notes: parsed.data.notes ?? null,
    };
    const validationIssue = await validateBookingInterval(
      buildValidationStore(),
      {
        id: "__new_booking__",
        tenantId,
        staffId: candidate.staffId ?? null,
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
      },
      {
        startsAt: candidate.startsAt,
        endsAt: candidate.endsAt,
        staffId: candidate.staffId ?? null,
      }
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

    try {
      const booking = await transactionalPrisma.$transaction(async (tx) => {
        const createdBooking = await tx.booking.create({
          data: candidate,
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            action: "manual_booking_created",
            entityType: "Booking",
            entityId: createdBooking.id,
            metadata: JSON.stringify({
              clientId: candidate.clientId,
              serviceId: candidate.serviceId,
              staffId: candidate.staffId ?? null,
              startsAt: candidate.startsAt.toISOString(),
              endsAt: candidate.endsAt.toISOString(),
            }),
          },
        });

        return createdBooking;
      });

      return NextResponse.json({ ok: true, booking: serializeBooking(booking) }, { status: 201 });
    } catch (error) {
      if (isBookingOverlapError(error)) {
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
  });
}

export async function PATCH(req: NextRequest, { params }: RouteContext) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = updateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      const existingBooking = await findTenantBooking(tenantId, params.id);
      if (!existingBooking) {
        return jsonError("BOOKING_NOT_FOUND", 404);
      }

      const updateData: BookingUpdateData = parsed.data;
      const candidateInterval = mergeBookingInterval(existingBooking, {
        startsAt: updateData.startsAt,
        endsAt: updateData.endsAt,
      });
      const validationIssue = await validateBookingInterval(
        buildValidationStore(),
        existingBooking,
        {
          ...candidateInterval,
          staffId: updateData.staffId ?? existingBooking.staffId,
        }
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

      const booking = await bookingDelegate.update({
        where: { id: existingBooking.id },
        data: updateData,
      });

      return NextResponse.json({ ok: true, booking: serializeBooking(booking) });
    } catch (error) {
      if (isBookingOverlapError(error)) {
        return NextResponse.json(
          {
            ok: false,
            error: "BOOKING_OVERLAP",
            message: "Booking overlaps with another booking for the selected time.",
          },
          { status: 409 }
        );
      }

      if (isMissingRecordError(error)) {
        return jsonError("BOOKING_NOT_FOUND", 404);
      }

      throw error;
    }
  });
}

function serializeBooking(booking: BookingRecord) {
  return {
    ...booking,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
  };
}
