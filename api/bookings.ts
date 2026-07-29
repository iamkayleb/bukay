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

const bookingDelegate = prisma.booking as unknown as {
  findFirst(args: unknown): Promise<BookingRecord | null>;
  findMany(args: unknown): Promise<BookingRecord[]>;
  update(args: unknown): Promise<BookingRecord>;
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
        where: { id: existingBooking.id, tenantId },
        data: updateData,
      });

      return NextResponse.json({ ok: true, booking: serializeBooking(booking) });
    } catch (error) {
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
