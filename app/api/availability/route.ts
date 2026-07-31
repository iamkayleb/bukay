import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import {
  getAvailabilityWindows,
  type AvailabilityEngineConfig,
} from "@/app/lib/availability/engine";

export const dynamic = "force-dynamic";

const availabilityConfig: AvailabilityEngineConfig = {
  weekdayHours: {
    monday: [{ start: "09:00", end: "17:00" }],
    tuesday: [{ start: "10:00", end: "15:00" }],
    wednesday: [{ start: "08:30", end: "12:30" }],
    thursday: [{ start: "09:00", end: "17:00" }],
    friday: [{ start: "09:00", end: "16:00" }],
  },
  blackoutDates: [],
};

const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must use YYYY-MM-DD format"),
  days: z.coerce.number().int().min(1).max(31).default(7),
});

export function GET(req: NextRequest) {
  const parsed = availabilityQuerySchema.safeParse({
    date: req.nextUrl.searchParams.get("date"),
    days: req.nextUrl.searchParams.get("days") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "validation_failed",
        fieldErrors: parsed.error.flatten().fieldErrors,
      },
      { status: 422 }
    );
  }

  try {
    const windows = getAvailabilityWindows(
      { startDate: parsed.data.date, days: parsed.data.days },
      availabilityConfig
    );

    return NextResponse.json({ ok: true, windows });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "invalid_availability_query",
        message: error instanceof Error ? error.message : "Availability query is invalid",
      },
      { status: 422 }
    );
  }
}
