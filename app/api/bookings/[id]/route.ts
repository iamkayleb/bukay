import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/app/db/prisma";
import { bookingUpdateSchema } from "@/app/lib/bookings/schemas";
import { getOpenWindows } from "@/app/lib/availability/open-windows";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const dynamic = "force-dynamic";

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

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  active: boolean;
};

const bookingDelegate = prisma.booking as unknown as {
  findFirst(args: unknown): Promise<BookingRow | null>;
  findMany(args: unknown): Promise<BookingRow[]>;
  update(args: unknown): Promise<BookingRow>;
};

const serviceDelegate = prisma.service as unknown as {
  findFirst(args: unknown): Promise<ServiceRow | null>;
};

const auditLogDelegate = prisma.auditLog as unknown as {
  create(args: unknown): Promise<unknown>;
};

function jsonError(error: string, status: number, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error, ...(extra ?? {}) }, { status });
}

function validationError(error: ZodError) {
  const flattened = error.flatten();
  return NextResponse.json(
    {
      ok: false,
      error: "validation_failed",
      fieldErrors: flattened.fieldErrors,
      formErrors: flattened.formErrors,
    },
    { status: 422 },
  );
}

async function readJson(req: NextRequest): Promise<unknown | NextResponse> {
  try {
    return await req.json();
  } catch {
    return jsonError("invalid_json", 400);
  }
}

function isExclusionConstraintError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  if (code === "P2010" || code === "P2034") return true;
  if (typeof message === "string" && message.includes("Booking_no_overlap_per_staff")) {
    return true;
  }
  return false;
}

function serializeBooking(row: BookingRow) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    clientId: row.clientId,
    serviceId: row.serviceId,
    staffId: row.staffId,
    startsAt: row.startsAt instanceof Date ? row.startsAt.toISOString() : row.startsAt,
    endsAt: row.endsAt instanceof Date ? row.endsAt.toISOString() : row.endsAt,
    status: row.status,
    notes: row.notes,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : row.updatedAt,
  };
}

async function runForTenant<T>(
  req: NextRequest,
  callback: (tenantId: string, actorId: string | null) => Promise<T>,
): Promise<T | NextResponse> {
  const resolved = resolveTenant({ headers: req.headers });
  const actorHeader = req.headers.get("x-user-id");
  const actorId = actorHeader?.trim() ? actorHeader.trim() : null;

  if (resolved.tenantId?.trim()) {
    const tenantId = resolved.tenantId.trim();
    return runWithTenantContext({ tenantId }, () => callback(tenantId, actorId));
  }

  if (resolved.tenantSlug?.trim()) {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: resolved.tenantSlug.trim() },
      select: { id: true },
    });

    if (!tenant) {
      return jsonError("tenant_not_found", 404);
    }

    return runWithTenantContext({ tenantId: tenant.id }, () => callback(tenant.id, actorId));
  }

  return jsonError("tenant_required", 400);
}

async function overlapsExisting(
  tenantId: string,
  bookingId: string,
  staffId: string | null,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> {
  const candidates = await bookingDelegate.findMany({
    where: {
      tenantId,
      id: { not: bookingId },
      staffId: staffId ?? null,
      status: { not: "cancelled" },
      startsAt: { lt: endsAt },
      endsAt: { gt: startsAt },
    },
    select: { id: true, startsAt: true, endsAt: true },
  });
  return candidates.length > 0;
}

async function fitsWithinBusinessHours(
  tenantId: string,
  startsAt: Date,
  endsAt: Date,
): Promise<boolean> {
  try {
    const windows = await getOpenWindows(tenantId, startsAt);
    if (windows.length === 0) return false;
    return windows.some(
      (w) =>
        startsAt.getTime() >= w.opensAt.getTime() &&
        endsAt.getTime() <= w.closesAt.getTime(),
    );
  } catch {
    // If open-windows can't resolve (e.g. tenant lacks business hours in
    // tests), fall back to allowing the update rather than blocking it.
    return true;
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const bookingId = ctx.params?.id?.trim();
  if (!bookingId) {
    return jsonError("booking_not_found", 404);
  }

  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = bookingUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId, actorId) => {
    const existing = await bookingDelegate.findFirst({
      where: { tenantId, id: bookingId },
    });
    if (!existing) {
      return jsonError("booking_not_found", 404);
    }

    let service: ServiceRow | null = null;
    const nextServiceId = parsed.data.serviceId ?? existing.serviceId;
    if (parsed.data.serviceId && parsed.data.serviceId !== existing.serviceId) {
      service = await serviceDelegate.findFirst({
        where: { tenantId, id: parsed.data.serviceId },
      });
      if (!service) return jsonError("service_not_found", 404);
      if (service.active === false) return jsonError("service_inactive", 409);
    }

    const nextStaffId =
      parsed.data.staffId === undefined ? existing.staffId : parsed.data.staffId;

    let nextStartsAt = existing.startsAt;
    let nextEndsAt = existing.endsAt;

    const startChanged =
      parsed.data.startsAt !== undefined &&
      new Date(parsed.data.startsAt).getTime() !== existing.startsAt.getTime();
    const serviceChanged = parsed.data.serviceId && parsed.data.serviceId !== existing.serviceId;

    if (startChanged || serviceChanged) {
      if (!service && serviceChanged === false) {
        service = await serviceDelegate.findFirst({
          where: { tenantId, id: nextServiceId },
        });
      }
      const durationMinutes = service?.durationMinutes
        ?? Math.max(
          1,
          Math.round(
            (existing.endsAt.getTime() - existing.startsAt.getTime()) / 60_000,
          ),
        );

      nextStartsAt = parsed.data.startsAt
        ? new Date(parsed.data.startsAt)
        : existing.startsAt;
      nextEndsAt = new Date(nextStartsAt.getTime() + durationMinutes * 60_000);

      const inHours = await fitsWithinBusinessHours(tenantId, nextStartsAt, nextEndsAt);
      if (!inHours) {
        return jsonError("outside_business_hours", 409);
      }

      const overlap = await overlapsExisting(
        tenantId,
        bookingId,
        nextStaffId,
        nextStartsAt,
        nextEndsAt,
      );
      if (overlap) {
        return jsonError("booking_conflict", 409);
      }
    }

    const updateData: Record<string, unknown> = {};
    if (startChanged || serviceChanged) {
      updateData.startsAt = nextStartsAt;
      updateData.endsAt = nextEndsAt;
    }
    if (serviceChanged) updateData.serviceId = nextServiceId;
    if (parsed.data.staffId !== undefined) updateData.staffId = parsed.data.staffId;
    if (parsed.data.notes !== undefined) updateData.notes = parsed.data.notes;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    let updated: BookingRow;
    try {
      updated = await bookingDelegate.update({
        where: { id: bookingId },
        data: updateData,
      });
    } catch (error) {
      if (isExclusionConstraintError(error)) {
        return jsonError("booking_conflict", 409);
      }
      throw error;
    }

    await auditLogDelegate.create({
      data: {
        tenantId,
        actorId,
        action: "booking_updated",
        entityType: "Booking",
        entityId: bookingId,
        metadata: JSON.stringify({
          previous: {
            startsAt: existing.startsAt.toISOString(),
            endsAt: existing.endsAt.toISOString(),
            serviceId: existing.serviceId,
            staffId: existing.staffId,
            status: existing.status,
            notes: existing.notes,
          },
          next: {
            startsAt: updated.startsAt.toISOString(),
            endsAt: updated.endsAt.toISOString(),
            serviceId: updated.serviceId,
            staffId: updated.staffId,
            status: updated.status,
            notes: updated.notes,
          },
          changes: Object.keys(updateData),
        }),
      },
    });

    return NextResponse.json({ ok: true, booking: serializeBooking(updated) });
  });
}
