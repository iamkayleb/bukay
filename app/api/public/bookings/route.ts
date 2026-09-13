import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { InvalidPhoneNumberError, normalizeNigerianPhone } from "@/app/lib/phone";
import { getSlotHoldStore, type SlotHoldKey } from "@/app/lib/slot-hold";
import { jsonError, readJson, validationError } from "@/app/api/services/_helpers";
import {
  validateBookingInterval,
  type BookingRecord,
  type BookingValidationStore,
  type BusinessHourRecord,
} from "@/services/bookingValidation";

export const dynamic = "force-dynamic";

const isoDateField = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date;
}, z.date({ invalid_type_error: "startsAt must be a valid ISO date" }));

const publicBookingSchema = z
  .object({
    slug: z.string().trim().min(1, "slug is required"),
    serviceId: z.string().trim().min(1, "serviceId is required"),
    staffId: z.string().trim().min(1, "staffId must not be blank").nullable().optional(),
    startsAt: isoDateField,
    name: z
      .string()
      .trim()
      .min(1, "name is required")
      .max(120, "name must be 120 characters or fewer"),
    phone: z.string().trim().min(1, "phone is required"),
    notes: z.string().trim().max(500, "notes must be 500 characters or fewer").nullable().optional(),
  })
  .strict();

type TenantRow = { id: string; active: boolean };
type ServiceRow = { id: string; tenantId: string; durationMinutes: number; active: boolean };
type ClientRow = { id: string; tenantId: string; name: string; phone: string };
type CreatedBookingRow = {
  id: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
};

const tenantDelegate = prisma.tenant as unknown as {
  findUnique(args: unknown): Promise<TenantRow | null>;
};
const serviceDelegate = prisma.service as unknown as {
  findFirst(args: unknown): Promise<ServiceRow | null>;
};
const clientDelegate = prisma.client as unknown as {
  findFirst(args: unknown): Promise<ClientRow | null>;
  create(args: unknown): Promise<ClientRow>;
  update(args: unknown): Promise<ClientRow>;
};
const bookingDelegate = prisma.booking as unknown as {
  findMany(args: unknown): Promise<BookingRecord[]>;
  create(args: unknown): Promise<CreatedBookingRow>;
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

function buildValidationStore(): BookingValidationStore {
  return {
    async findBusinessHours({ tenantId, dayOfWeek }) {
      return businessHourDelegate.findFirst({ where: { tenantId, dayOfWeek } });
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
      const overlapping = await bookingDelegate.findMany({
        where: {
          tenantId,
          id: { not: bookingId },
          staffId,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
        take: 1,
      });

      return overlapping[0] ?? null;
    },
  };
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

  const { slug, serviceId, startsAt, name, notes } = parsed.data;
  const staffId = parsed.data.staffId ?? null;

  let phone: string;
  try {
    phone = normalizeNigerianPhone(parsed.data.phone);
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return jsonError("invalid_phone", 400);
    }
    throw error;
  }

  const tenant = await tenantDelegate.findUnique({
    where: { slug },
    select: { id: true, active: true },
  });
  if (!tenant || !tenant.active) {
    return jsonError("tenant_not_found", 404);
  }
  const tenantId = tenant.id;

  return runWithTenantContext({ tenantId }, async () => {
    const service = await serviceDelegate.findFirst({
      where: { tenantId, id: serviceId, active: true },
      select: { id: true, tenantId: true, durationMinutes: true, active: true },
    });
    if (!service) {
      return jsonError("service_not_found", 404);
    }

    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

    const holdKey: SlotHoldKey = { tenantId, serviceId, staffId, startsAt };
    const hold = getSlotHoldStore().acquire(holdKey);
    if (!hold.ok) {
      return NextResponse.json(
        { ok: false, error: "slot_held", retryAfter: hold.expiresAt },
        { status: 409 }
      );
    }

    try {
      const validationIssue = await validateBookingInterval(
        buildValidationStore(),
        { id: "__new__", tenantId, staffId, startsAt, endsAt },
        { startsAt, endsAt, staffId }
      );
      if (validationIssue) {
        getSlotHoldStore().release(holdKey, hold.holdId);
        return NextResponse.json(
          { ok: false, error: validationIssue.code, message: validationIssue.message },
          { status: validationIssue.status }
        );
      }

      let client = await clientDelegate.findFirst({ where: { tenantId, phone } });
      if (!client) {
        client = await clientDelegate.create({ data: { tenantId, phone, name } });
      } else if (client.name !== name) {
        client = await clientDelegate.update({
          where: { id: client.id, tenantId },
          data: { name },
        });
      }

      const booking = await bookingDelegate.create({
        data: {
          tenantId,
          clientId: client.id,
          serviceId: service.id,
          staffId,
          startsAt,
          endsAt,
          status: "pending_payment",
          notes: notes ?? null,
        },
      });

      return NextResponse.json(
        {
          ok: true,
          booking: {
            id: booking.id,
            status: booking.status,
            startsAt: booking.startsAt.toISOString(),
            endsAt: booking.endsAt.toISOString(),
          },
          hold: { expiresAt: hold.expiresAt },
        },
        { status: 201 }
      );
    } catch (error) {
      getSlotHoldStore().release(holdKey, hold.holdId);
      throw error;
    }
  });
}
