import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import {
  jsonError,
  readJson,
  runForTenant,
  validationError,
  isUniqueConstraintError,
} from "@/app/api/services/_helpers";
import { createManualBookingSchema } from "@/app/lib/bookings/manual-booking-schema";

export const dynamic = "force-dynamic";

type ClientRecord = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
};

type ServiceRecord = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
};

type StaffRecord = {
  id: string;
  tenantId: string;
  name: string;
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
  client?: ClientRecord;
  service?: ServiceRecord;
  staff?: StaffRecord | null;
};

type BookingTx = {
  client: {
    findFirst(args: unknown): Promise<ClientRecord | null>;
    create(args: unknown): Promise<ClientRecord>;
  };
  service: {
    findFirst(args: unknown): Promise<ServiceRecord | null>;
  };
  staff: {
    findFirst(args: unknown): Promise<StaffRecord | null>;
  };
  booking: {
    create(args: unknown): Promise<BookingRecord>;
  };
  auditLog: {
    create(args: unknown): Promise<unknown>;
  };
};

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

async function resolveClient(
  tx: BookingTx,
  tenantId: string,
  client: { id: string } | { name: string; phone: string; email?: string | null }
) {
  if ("id" in client) {
    return tx.client.findFirst({
      where: { tenantId, id: client.id },
    });
  }

  try {
    return await tx.client.create({
      data: {
        tenantId,
        name: client.name,
        phone: client.phone,
        email: client.email || null,
      },
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) {
      throw error;
    }

    return tx.client.findFirst({
      where: { tenantId, phone: client.phone },
    });
  }
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = createManualBookingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      const booking = await bookingDb.$transaction(async (tx) => {
        const service = await tx.service.findFirst({
          where: { tenantId, id: parsed.data.serviceId, active: true },
          select: { id: true, tenantId: true, name: true, durationMinutes: true },
        });

        if (!service) {
          return null;
        }

        const [client, staff] = await Promise.all([
          resolveClient(tx, tenantId, parsed.data.client),
          parsed.data.staffId
            ? tx.staff.findFirst({
                where: { tenantId, id: parsed.data.staffId, active: true },
                select: { id: true, tenantId: true, name: true },
              })
            : tx.staff.findFirst({
                where: { tenantId, active: true },
                orderBy: { name: "asc" },
                select: { id: true, tenantId: true, name: true },
              }),
        ]);

        if (!client || !staff) {
          return null;
        }

        const startsAt = new Date(parsed.data.startsAt);
        const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
        const notes = parsed.data.notes?.trim() || null;
        const created = await tx.booking.create({
          data: {
            tenantId,
            clientId: client.id,
            serviceId: service.id,
            staffId: staff.id,
            startsAt,
            endsAt,
            status: "confirmed",
            notes,
          },
          include: {
            client: { select: { id: true, tenantId: true, name: true, phone: true, email: true } },
            service: { select: { id: true, tenantId: true, name: true, durationMinutes: true } },
            staff: { select: { id: true, tenantId: true, name: true } },
          },
        });

        await tx.auditLog.create({
          data: {
            tenantId,
            action: "manual_booking_created",
            entityType: "Booking",
            entityId: created.id,
            metadata: JSON.stringify({
              clientId: client.id,
              serviceId: service.id,
              staffId: staff.id,
              startsAt: startsAt.toISOString(),
              endsAt: endsAt.toISOString(),
            }),
          },
        });

        return created;
      });

      if (!booking) {
        return jsonError("booking_dependency_not_found", 404);
      }

      return NextResponse.json({ ok: true, booking: serializeBooking(booking) }, { status: 201 });
    } catch (error) {
      if (isBookingOverlapError(error)) {
        return jsonError("booking_overlap", 409);
      }

      throw error;
    }
  });
}
