import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { jsonError, runForTenant } from "@/app/api/services/_helpers";
import { serializeClient } from "../_helpers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function GET(req: NextRequest, { params }: RouteContext) {
  return runForTenant(req, async (tenantId) => {
    const client = await prisma.client.findFirst({
      where: { tenantId, id: params.id },
      include: {
        bookings: {
          where: { tenantId },
          orderBy: { startsAt: "desc" },
          include: { service: { select: { id: true, name: true } } },
        },
      },
    });

    if (!client) {
      return jsonError("client_not_found", 404);
    }

    return NextResponse.json({
      ok: true,
      client: serializeClient(client),
      bookings: client.bookings.map((booking) => ({
        id: booking.id,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        status: booking.status,
        notes: booking.notes,
        service: booking.service,
      })),
    });
  });
}
