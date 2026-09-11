import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { normalizeNigerianPhone } from "@/app/lib/phone";
import { slotHolds } from "@/app/lib/slot-hold";

const bookingRequestSchema = z.object({
  slug: z.string().trim().min(1),
  serviceId: z.string().trim().min(1),
  startsAt: z.string().datetime(),
  name: z.string().trim().min(1),
  phone: z.string().trim().min(1),
  sessionId: z.string().trim().min(1),
});

type PublicService = {
  id: string;
  tenantId: string;
  durationMinutes: number;
  tenant: { currency: string; slug: string };
};

const serviceDelegate = prisma.service as unknown as {
  findFirst(args: unknown): Promise<PublicService | null>;
};

const clientDelegate = prisma.client as unknown as {
  upsert(args: unknown): Promise<{ id: string }>;
};

const bookingDelegate = prisma.booking as unknown as {
  create(args: unknown): Promise<{ id: string; status: string }>;
};

export async function POST(request: NextRequest) {
  const body: unknown = await request.json().catch(() => null);
  const parsed = bookingRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_BOOKING_REQUEST" }, { status: 400 });
  }

  let phone: string;
  try {
    phone = normalizeNigerianPhone(parsed.data.phone);
  } catch {
    return NextResponse.json({ error: "INVALID_PHONE_NUMBER" }, { status: 400 });
  }

  const service = await serviceDelegate.findFirst({
    where: {
      id: parsed.data.serviceId,
      active: true,
      tenant: { slug: parsed.data.slug, active: true },
    },
    select: {
      id: true,
      tenantId: true,
      durationMinutes: true,
      tenant: { select: { currency: true, slug: true } },
    },
  });
  if (!service) {
    return NextResponse.json({ error: "SERVICE_NOT_FOUND" }, { status: 404 });
  }

  const startsAt = new Date(parsed.data.startsAt);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
  const slot = `${service.tenantId}:${service.id}:${startsAt.toISOString()}`;
  if (!slotHolds.acquire(slot, parsed.data.sessionId)) {
    return NextResponse.json({ error: "SLOT_HELD" }, { status: 409 });
  }

  try {
    const client = await clientDelegate.upsert({
      where: { tenantId_phone: { tenantId: service.tenantId, phone } },
      update: { name: parsed.data.name },
      create: { tenantId: service.tenantId, name: parsed.data.name, phone },
    });
    const booking = await bookingDelegate.create({
      data: {
        tenantId: service.tenantId,
        clientId: client.id,
        serviceId: service.id,
        startsAt,
        endsAt,
        status: "pending_payment",
      },
    });

    return NextResponse.json(
      { booking: { id: booking.id, status: booking.status, startsAt: startsAt.toISOString() } },
      { status: 201 }
    );
  } catch (error) {
    slotHolds.release(slot, parsed.data.sessionId);
    throw error;
  }
}
