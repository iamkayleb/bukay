import { describe, expect, it } from "vitest";

import { buildBookingIcs, ICS_CONTENT_TYPE } from "@/app/lib/ics";

describe("buildBookingIcs", () => {
  const startsAt = new Date("2026-07-27T10:00:00.000Z");
  const endsAt = new Date("2026-07-27T11:00:00.000Z");

  it("produces an RFC 5545 calendar importable by Google Calendar", () => {
    const ics = buildBookingIcs({
      uid: "booking-1@bukay",
      startsAt,
      endsAt,
      summary: "Classic Haircut with Bukay Demo Salon",
      description: "Booking confirmed for Jane Doe.",
    });

    // Google Calendar's importer requires CRLF line endings and rejects
    // bare LF, so this is asserted explicitly rather than just via content.
    expect(ics).toContain("\r\n");
    expect(ics.includes("\n") && !ics.includes("\r\n")).toBe(false);

    const lines = ics.split("\r\n").filter((line) => line.length > 0);
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines.some((line) => line.startsWith("PRODID:"))).toBe(true);
    expect(lines).toContain("BEGIN:VEVENT");
    expect(lines.some((line) => line === "UID:booking-1@bukay")).toBe(true);
    expect(lines.some((line) => line.startsWith("DTSTAMP:"))).toBe(true);
    expect(lines.some((line) => line === "DTSTART:20260727T100000Z")).toBe(true);
    expect(lines.some((line) => line === "DTEND:20260727T110000Z")).toBe(true);
    expect(lines.some((line) => line.startsWith("SUMMARY:"))).toBe(true);
    expect(lines.some((line) => line.startsWith("DESCRIPTION:"))).toBe(true);
    expect(lines).toContain("END:VEVENT");
    expect(lines[lines.length - 1]).toBe("END:VCALENDAR");

    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it("escapes commas, semicolons, and backslashes in text fields", () => {
    const ics = buildBookingIcs({
      uid: "booking-2@bukay",
      startsAt,
      endsAt,
      summary: "Cut, style; trim \\ finish",
    });

    expect(ics).toContain("SUMMARY:Cut\\, style\\; trim \\\\ finish");
  });

  it("folds lines longer than 75 octets with a leading space continuation", () => {
    const ics = buildBookingIcs({
      uid: "booking-3@bukay",
      startsAt,
      endsAt,
      summary: "A".repeat(200),
    });

    const physicalLines = ics.split("\r\n");
    const continuationLines = physicalLines.filter((line) => line.startsWith(" "));
    expect(continuationLines.length).toBeGreaterThan(0);
    for (const line of physicalLines) {
      expect(line.length).toBeLessThanOrEqual(75);
    }
  });

  it("exposes the text/calendar content type", () => {
    expect(ICS_CONTENT_TYPE).toBe("text/calendar; charset=utf-8");
  });
});
