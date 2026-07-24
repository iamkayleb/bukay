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

type BookingTx = {
  service: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
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
            metadata: JSON.stringify({
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
            }),
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

      return NextResponse.json({ ok: true, booking: serializeBooking(booking) });
    } catch (error) {
      if (isBookingOverlapError(error)) {
        return jsonError("booking_overlap", 409);
      }

      throw error;
    }
  });
}
