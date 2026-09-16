import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { normalizeNigerianPhone } from "@/app/lib/phone";
import { SlotHoldStore } from "@/app/lib/slot-hold";

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

type BookingTransaction = {
  client: {
    upsert(args: unknown): Promise<{ id: string }>;
  };
  booking: {
    create(args: unknown): Promise<{ id: string; status: string }>;
  };
  slotHold: ConstructorParameters<typeof SlotHoldStore>[0];
};

const bookingTransaction = prisma.$transaction as unknown as <T>(
  callback: (transaction: BookingTransaction) => Promise<T>
) => Promise<T>;

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
  const booking = await bookingTransaction(async (transaction) => {
    const transactionSlotHolds = new SlotHoldStore(transaction.slotHold);
    if (!(await transactionSlotHolds.acquire(slot, service.tenantId, parsed.data.sessionId))) {
      return null;
    }

    const client = await transaction.client.upsert({
      where: { tenantId_phone: { tenantId: service.tenantId, phone } },
      update: { name: parsed.data.name },
      create: { tenantId: service.tenantId, name: parsed.data.name, phone },
    });
    return transaction.booking.create({
      data: {
        tenantId: service.tenantId,
        clientId: client.id,
        serviceId: service.id,
        startsAt,
        endsAt,
        status: "pending_payment",
      },
    });
  });

  if (!booking) {
    return NextResponse.json({ error: "SLOT_HELD" }, { status: 409 });
  }

  return NextResponse.json(
    { booking: { id: booking.id, status: booking.status, startsAt: startsAt.toISOString() } },
    { status: 201 }
  );
}
