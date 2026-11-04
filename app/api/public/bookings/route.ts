import { NextRequest, NextResponse } from "next/server";

import { readJson, validationError } from "@/app/api/services/_helpers";
import {
  createPublicBooking,
  createPublicBookingSchema,
} from "@/app/api/public/bookings/create-public-booking";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = createPublicBookingSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  const sessionFromHeader = req.headers.get("x-booking-session")?.trim();
  const result = await createPublicBooking({
    ...parsed.data,
    sessionId: parsed.data.sessionId ?? sessionFromHeader ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        message: "message" in result ? result.message : undefined,
        holdExpiresAt: "holdExpiresAt" in result ? result.holdExpiresAt : undefined,
      },
      { status: result.status }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      booking: result.booking,
      sessionId: result.sessionId,
      holdExpiresAt: result.holdExpiresAt,
    },
    { status: 201 }
  );
}
