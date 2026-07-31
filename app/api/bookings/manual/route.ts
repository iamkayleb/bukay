import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { prisma } from "@/app/db/prisma";
import { manualBookingSchema, type ManualBookingInput } from "@/app/lib/bookings/schemas";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const dynamic = "force-dynamic";

type ServiceRow = {
  id: string;
  tenantId: string;
  durationMinutes: number;
  name: string;
  active: boolean;
};

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  email: string | null;
};

type StaffRow = {
  id: string;
  tenantId: string;
  name: string;
  active: boolean;
};

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

const serviceDelegate = prisma.service as unknown as {
  findFirst(args: unknown): Promise<ServiceRow | null>;
};

const staffDelegate = prisma.staff as unknown as {
  findFirst(args: unknown): Promise<StaffRow | null>;
};

const clientDelegate = prisma.client as unknown as {
  findFirst(args: unknown): Promise<ClientRow | null>;
  create(args: unknown): Promise<ClientRow>;
};

const bookingDelegate = prisma.booking as unknown as {
  create(args: unknown): Promise<BookingRow>;
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

function isUniqueConstraintError(error: unknown) {
  return (
    !!error &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2002"
  );
}

function isExclusionConstraintError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  // Prisma surfaces raw Postgres exclusion violations under P2010 (raw query
  // failure) or P2034 (transaction conflict). The message contains the
  // constraint name so we can match on that as a fallback.
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

async function resolveClient(
  tenantId: string,
  input: ManualBookingInput,
): Promise<{ client: ClientRow; created: boolean } | { error: NextResponse }> {
  if (input.clientId) {
    const client = await clientDelegate.findFirst({
      where: { tenantId, id: input.clientId },
    });
    if (!client) {
      return { error: jsonError("client_not_found", 404) };
    }
    return { client, created: false };
  }

  const newClient = input.newClient!;

  const existing = await clientDelegate.findFirst({
    where: { tenantId, phone: newClient.phone },
  });
  if (existing) {
    return { client: existing, created: false };
  }

  try {
    const created = await clientDelegate.create({
      data: {
        tenantId,
        name: newClient.name,
        phone: newClient.phone,
        email: newClient.email ?? null,
      },
    });
    return { client: created, created: true };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const conflict = await clientDelegate.findFirst({
        where: { tenantId, phone: newClient.phone },
      });
      if (conflict) {
        return { client: conflict, created: false };
      }
    }
    throw error;
  }
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = manualBookingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId, actorId) => {
    const service = await serviceDelegate.findFirst({
      where: { tenantId, id: parsed.data.serviceId },
    });
    if (!service) {
      return jsonError("service_not_found", 404);
    }
    if (service.active === false) {
      return jsonError("service_inactive", 409);
    }

    if (parsed.data.staffId) {
      const staff = await staffDelegate.findFirst({
        where: { tenantId, id: parsed.data.staffId },
      });
      if (!staff) {
        return jsonError("staff_not_found", 404);
      }
      if (staff.active === false) {
        return jsonError("staff_inactive", 409);
      }
    }

    const clientResult = await resolveClient(tenantId, parsed.data);
    if ("error" in clientResult) {
      return clientResult.error;
    }

    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

    let booking: BookingRow;
    try {
      booking = await bookingDelegate.create({
        data: {
          tenantId,
          clientId: clientResult.client.id,
          serviceId: service.id,
          staffId: parsed.data.staffId ?? null,
          startsAt,
          endsAt,
          status: "confirmed",
          notes: parsed.data.notes ?? null,
        },
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
        action: "manual_booking_created",
        entityType: "Booking",
        entityId: booking.id,
        metadata: JSON.stringify({
          clientId: clientResult.client.id,
          clientCreated: clientResult.created,
          serviceId: service.id,
          staffId: parsed.data.staffId ?? null,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }),
      },
    });

    return NextResponse.json(
      {
        ok: true,
        booking: serializeBooking(booking),
        client: {
          id: clientResult.client.id,
          name: clientResult.client.name,
          phone: clientResult.client.phone,
          email: clientResult.client.email,
          created: clientResult.created,
        },
      },
      { status: 201 },
    );
  });
}
