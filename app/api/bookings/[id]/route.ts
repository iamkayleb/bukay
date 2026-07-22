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
  booking: {
    findFirst(args: unknown): Promise<BookingRecord | null>;
    update(args: unknown): Promise<BookingRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

const rescheduleBookingSchema = z
  .object({
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
    message: "endsAt must be after startsAt",
    path: ["endsAt"],
  });

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

  const parsed = rescheduleBookingSchema.safeParse(body);
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

        const startsAt = new Date(parsed.data.startsAt);
        const endsAt = new Date(parsed.data.endsAt);
        const updated = await tx.booking.update({
          where: { id: existing.id },
          data: { startsAt, endsAt },
          include: {
            client: { select: { name: true } },
            service: { select: { name: true } },
            staff: { select: { name: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            action: "booking_rescheduled",
            entityType: "Booking",
            entityId: existing.id,
            metadata: JSON.stringify({
              oldStartsAt: isoDate(existing.startsAt),
              oldEndsAt: isoDate(existing.endsAt),
              newStartsAt: startsAt.toISOString(),
              newEndsAt: endsAt.toISOString(),
            }),
          },
        });

        return updated;
      });

      if (!booking) {
        return jsonError("booking_not_found", 404);
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
