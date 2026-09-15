import { prisma } from "@/app/db/prisma";
import { verifyBookingToken } from "@/app/lib/tokens";

export type ConfirmedBooking = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  tenantName: string;
  tenantSlug: string;
  serviceName: string;
  clientName: string;
};

export type ConfirmedBookingResult =
  | { ok: true; booking: ConfirmedBooking }
  | { ok: false; status: 400 | 404 | 410 };

export async function getConfirmedBooking(
  slug: string,
  token: string | undefined
): Promise<ConfirmedBookingResult> {
  if (!token) {
    return { ok: false, status: 400 };
  }

  const verified = await verifyBookingToken(token);
  if (!verified.ok) {
    return { ok: false, status: verified.status };
  }

  const booking = await prisma.booking.findFirst({
    where: { id: verified.bookingId, tenant: { slug } },
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      status: true,
      tenant: { select: { name: true, slug: true } },
      service: { select: { name: true } },
      client: { select: { name: true } },
    },
  });

  if (!booking) {
    return { ok: false, status: 404 };
  }

  return {
    ok: true,
    booking: {
      id: booking.id,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: booking.status,
      tenantName: booking.tenant.name,
      tenantSlug: booking.tenant.slug,
      serviceName: booking.service.name,
      clientName: booking.client.name,
    },
  };
}
