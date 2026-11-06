import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/bookings/route";
import { calendarDayRange, dateInZone } from "@/app/lib/calendar";
const db = new PrismaClient();
const ids = ["calendar-list-one", "calendar-list-two"];
function request(from: string, to: string, tenant = ids[0]) {
  return GET(
    new NextRequest(`http://localhost/api/bookings?${new URLSearchParams({ from, to })}`, {
      headers: { "x-tenant-id": tenant },
    })
  );
}
beforeAll(async () => {
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
  for (const id of ids) {
    await db.tenant.create({ data: { id, slug: id, name: id } });
    const client = await db.client.create({
      data: { tenantId: id, name: `Client ${id}`, phone: "+2348000000111" },
    });
    const service = await db.service.create({
      data: { tenantId: id, name: "Haircut", durationMinutes: 30, priceCents: 5000 },
    });
    for (const time of [
      "2026-06-16T00:00:00Z",
      "2026-06-15T23:59:59Z",
      "2026-06-15T10:00:00Z",
      "2026-06-15T00:00:00Z",
      "2026-06-14T23:59:59Z",
    ]) {
      await db.booking.create({
        data: {
          tenantId: id,
          clientId: client.id,
          serviceId: service.id,
          startsAt: new Date(time),
          endsAt: new Date(new Date(time).getTime() + 1800000),
          status: "confirmed",
        },
      });
    }
  }
}, 120_000);
afterAll(async () => {
  await db.booking.deleteMany({ where: { tenantId: { in: ids } } });
  await db.tenant.deleteMany({ where: { id: { in: ids } } });
  await db.$disconnect();
}, 120_000);
describe("booking list against real SQLite", () => {
  it("includes both date bounds, orders rows, and includes names and status", async () => {
    const response = await request("2026-06-15", "2026-06-15");
    expect(response.status).toBe(200);
    const { bookings } = await response.json();
    expect(bookings.map((b: { startsAt: string }) => b.startsAt)).toEqual([
      "2026-06-15T00:00:00.000Z",
      "2026-06-15T10:00:00.000Z",
      "2026-06-15T23:59:59.000Z",
    ]);
    expect(bookings[0]).toMatchObject({
      client: { name: `Client ${ids[0]}` },
      service: { name: "Haircut" },
      status: "confirmed",
    });
  });
  it("returns only the requested tenant even with identical booking times", async () => {
    const response = await request("2026-01-01", "2026-12-31", ids[1]);
    const { bookings } = await response.json();
    expect(bookings).toHaveLength(5);
    expect(
      bookings.every((b: { client: { name: string } }) => b.client.name === `Client ${ids[1]}`)
    ).toBe(true);
  });
  it("uses exclusive timestamp upper bounds and returns an empty range", async () => {
    const { bookings } = await (
      await request("2026-06-15T00:00:00Z", "2026-06-15T10:00:00Z")
    ).json();
    expect(bookings).toHaveLength(1);
    expect((await (await request("2027-01-01", "2027-01-02")).json()).bookings).toEqual([]);
  });
  it.each([
    ["bad", "2026-01-01"],
    ["2026-02-30", "2026-03-01"],
    ["2026-02-01", "2026-01-01"],
  ])("rejects invalid ranges %s to %s", async (from, to) => {
    expect((await request(from, to)).status).toBe(400);
  });
  it("requires tenant context", async () => {
    expect(
      (await GET(new NextRequest("http://localhost/api/bookings?from=2026-01-01&to=2026-12-31")))
        .status
    ).toBe(400);
  });
  it("uses business dates and handles DST", () => {
    expect(dateInZone(new Date("2026-06-14T23:30:00Z"), "Africa/Lagos")).toBe("2026-06-15");
    const lagos = calendarDayRange("2026-06-15", "Africa/Lagos");
    expect(lagos.start.toISOString()).toBe("2026-06-14T23:00:00.000Z");
    expect(lagos.end.toISOString()).toBe("2026-06-15T23:00:00.000Z");
    for (const [date, hours] of [
      ["2026-03-08", 23],
      ["2026-11-01", 25],
    ] as const) {
      const { start, end } = calendarDayRange(date, "America/New_York");
      expect((end.getTime() - start.getTime()) / 3600000).toBe(hours);
    }
  });
});
