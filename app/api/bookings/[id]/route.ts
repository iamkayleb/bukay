import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { jsonError, readJson, runForTenant, validationError } from "@/app/api/services/_helpers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

type BookingRecord = {
  id: string;
  tenantId: string;
  clientId: string;
  serviceId: string;
  staffId: string | null;
  startsAt: Date | string;
  endsAt: Date | string;
  status: string;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  client?: { name: string };
  service?: { name: string };
  staff?: { name: string } | null;
};

type BusinessHourRecord = {
  opensAt: string;
  closesAt: string;
};

type BlackoutRecord = {
  id: string;
};

type BookingTx = {
  service: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  businessHour: {
    findMany(args: unknown): Promise<BusinessHourRecord[]>;
  };
  blackout: {
    findFirst(args: unknown): Promise<BlackoutRecord | null>;
  };
  booking: {
    findFirst(args: unknown): Promise<BookingRecord | null>;
    update(args: unknown): Promise<BookingRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

const idSchema = z.string().trim().min(1, "ID is required");
const bookingStatusSchema = z.enum(["pending", "confirmed", "cancelled", "completed"]);

const updateBookingSchema = z
  .object({
    serviceId: idSchema.optional(),
    startsAt: z.string().datetime().optional(),
    endsAt: z.string().datetime().optional(),
    notes: z
      .string()
      .trim()
      .max(2_000, "Notes must be 2000 characters or fewer")
      .nullable()
      .optional(),
    status: bookingStatusSchema.optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one booking field is required",
    path: ["_form"],
  })
  .refine((value) => (value.startsAt ? !!value.endsAt : true), {
    message: "End time is required when start time changes",
    path: ["endsAt"],
  })
  .refine((value) => (value.endsAt ? !!value.startsAt : true), {
    message: "Start time is required when end time changes",
    path: ["startsAt"],
  })
  .refine(
    (value) => {
      if (!value.startsAt || !value.endsAt) {
        return true;
      }

      return new Date(value.startsAt) < new Date(value.endsAt);
    },
    {
      message: "endsAt must be after startsAt",
      path: ["endsAt"],
    }
  );

const bookingDb = prisma as unknown as BookingTx & {
  $transaction<T>(callback: (tx: BookingTx) => Promise<T>): Promise<T>;
};

const WALL_CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

function isoDate(value: Date | string) {
  return value instanceof Date ? value.toISOString() : value;
}

function serializeBooking(booking: BookingRecord) {
  return {
    id: booking.id,
    tenantId: booking.tenantId,
    clientId: booking.clientId,
    serviceId: booking.serviceId,
    staffId: booking.staffId,
    startsAt: isoDate(booking.startsAt),
    endsAt: isoDate(booking.endsAt),
    status: booking.status,
    notes: booking.notes,
    createdAt: isoDate(booking.createdAt),
    updatedAt: isoDate(booking.updatedAt),
    client: booking.client,
    service: booking.service,
    staff: booking.staff,
  };
}

function isBookingOverlapError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  const meta = "meta" in error ? (error as { meta?: unknown }).meta : undefined;
  const message = error instanceof Error ? error.message : "";
  const details = `${message} ${typeof meta === "object" && meta ? JSON.stringify(meta) : ""}`;

  return (
    code === "P2004" ||
    details.includes("23P01") ||
    details.toLowerCase().includes("exclusion") ||
    details.includes("Booking_staffId_time_overlap_excl")
  );
}

function localDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

function dayOfWeekForLocalDate(date: string) {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

function minutesSinceMidnight(value: Date) {
  return value.getUTCHours() * 60 + value.getUTCMinutes();
}

function wallClockToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function isValidBusinessWindow(window: BusinessHourRecord) {
  return (
    WALL_CLOCK_PATTERN.test(window.opensAt) &&
    WALL_CLOCK_PATTERN.test(window.closesAt) &&
    window.opensAt < window.closesAt
  );
}

async function isInsideBusinessHours(
  tx: BookingTx,
  tenantId: string,
  startsAt: Date,
  endsAt: Date
) {
  const startsOn = localDate(startsAt);
  if (startsOn !== localDate(endsAt)) {
    return false;
  }

  const blackout = await tx.blackout.findFirst({
    where: {
      tenantId,
      date: startsOn,
    },
    select: { id: true },
  });

  if (blackout) {
    return false;
  }

  const windows = await tx.businessHour.findMany({
    where: {
      tenantId,
      dayOfWeek: dayOfWeekForLocalDate(startsOn),
    },
    orderBy: [{ opensAt: "asc" }, { closesAt: "asc" }],
    select: {
      opensAt: true,
      closesAt: true,
    },
  });
  const startMinutes = minutesSinceMidnight(startsAt);
  const endMinutes = minutesSinceMidnight(endsAt);

  return windows.filter(isValidBusinessWindow).some((window) => {
    return (
      startMinutes >= wallClockToMinutes(window.opensAt) &&
      endMinutes <= wallClockToMinutes(window.closesAt)
    );
  });
}

function outsideBusinessHoursError() {
  return NextResponse.json(
    {
      ok: false,
      error: "OUTSIDE_BUSINESS_HOURS",
      message: "Booking reschedules must start and end inside configured business hours.",
    },
    { status: 400 }
  );
}

function bookingOverlapError() {
  return NextResponse.json(
    {
      ok: false,
      error: "BOOKING_OVERLAP",
      message: "Booking reschedules must not overlap another booking for the same staff member.",
    },
    { status: 409 }
  );
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
      const booking = await bookingDb.$transaction(async (tx) => {
        const existing = await tx.booking.findFirst({
          where: { tenantId, id: params.id },
        });

        if (!existing) {
          return null;
        }

        if (parsed.data.serviceId) {
          const service = await tx.service.findFirst({
            where: { tenantId, id: parsed.data.serviceId, active: true },
            select: { id: true },
          });

          if (!service) {
            return "service_not_found";
          }
        }

        const startsAt = parsed.data.startsAt ? new Date(parsed.data.startsAt) : undefined;
        const endsAt = parsed.data.endsAt ? new Date(parsed.data.endsAt) : undefined;

        if (startsAt && endsAt && !(await isInsideBusinessHours(tx, tenantId, startsAt, endsAt))) {
          return "outside_business_hours";
        }

        if (startsAt && endsAt && existing.staffId) {
          const overlapping = await tx.booking.findFirst({
            where: {
              tenantId,
              staffId: existing.staffId,
              id: { not: existing.id },
              startsAt: { lt: endsAt },
              endsAt: { gt: startsAt },
            },
            select: { id: true },
          });

          if (overlapping) {
            return "booking_overlap";
          }
        }

        const data = {
          ...(parsed.data.serviceId ? { serviceId: parsed.data.serviceId } : {}),
          ...(startsAt ? { startsAt } : {}),
          ...(endsAt ? { endsAt } : {}),
          ...(parsed.data.status ? { status: parsed.data.status } : {}),
          ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        };
        const updated = await tx.booking.update({
          where: { id: existing.id },
          data,
          include: {
            client: { select: { name: true } },
            service: { select: { name: true } },
            staff: { select: { name: true } },
          },
        });
        const timeChanged =
          isoDate(existing.startsAt) !== isoDate(updated.startsAt) ||
          isoDate(existing.endsAt) !== isoDate(updated.endsAt);

        await tx.auditLog.create({
          data: {
            tenantId,
            action: timeChanged ? "booking_rescheduled" : "booking_updated",
            entityType: "Booking",
            entityId: existing.id,
            metadata: {
              oldStartsAt: isoDate(existing.startsAt),
              oldEndsAt: isoDate(existing.endsAt),
              newStartsAt: isoDate(updated.startsAt),
              newEndsAt: isoDate(updated.endsAt),
              oldServiceId: existing.serviceId,
              newServiceId: updated.serviceId,
              oldStatus: existing.status,
              newStatus: updated.status,
              oldNotes: existing.notes,
              newNotes: updated.notes,
            },
          },
        });

        return updated;
      });

      if (!booking) {
        return jsonError("booking_not_found", 404);
      }

      if (booking === "service_not_found") {
        return jsonError("booking_dependency_not_found", 404);
      }

      if (booking === "outside_business_hours") {
        return outsideBusinessHoursError();
      }

      if (booking === "booking_overlap") {
        return bookingOverlapError();
      }

      return NextResponse.json({ ok: true, booking: serializeBooking(booking) });
    } catch (error) {
      if (isBookingOverlapError(error)) {
        return bookingOverlapError();
      }

      throw error;
    }
  });
}
