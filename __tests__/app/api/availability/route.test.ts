import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/availability/route";

describe("GET /api/availability", () => {
  it("returns windows from the availability engine for the requested date range", async () => {
    const response = GET(
      new NextRequest("http://app.test/api/availability?date=2026-07-27&days=2")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      ok: true,
      windows: [
        {
          date: "2026-07-27",
          weekday: "monday",
          start: "09:00",
          end: "17:00",
          startsAt: "2026-07-27T09:00:00.000Z",
          endsAt: "2026-07-27T17:00:00.000Z",
        },
        {
          date: "2026-07-28",
          weekday: "tuesday",
          start: "10:00",
          end: "15:00",
          startsAt: "2026-07-28T10:00:00.000Z",
          endsAt: "2026-07-28T15:00:00.000Z",
        },
      ],
    });
  });

  it("returns validation errors for invalid query parameters", async () => {
    const response = GET(
      new NextRequest("http://app.test/api/availability?date=2026-07-27&days=0")
    );

    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.ok).toBe(false);
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.days).toContain("Number must be greater than or equal to 1");
  });
});
