import { beforeEach, describe, expect, it, vi } from "vitest";

type BookingRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  tenant: { name: string; slug: string };
  service: { name: string };
  client: { name: string };
};

const state = vi.hoisted(() => ({
  bookings: [] as BookingRow[],
  findFirst: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    booking: {
      findFirst: state.findFirst,
    },
  },
}));

import { getConfirmedBooking } from "@/app/[slug]/book/confirmed/data";
import { signBookingToken, signBookingTokenPayload, BOOKING_TOKEN_TTL_MS } from "@/app/lib/tokens";

const SECRET = "test-secret-must-be-long-enough";

function booking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "booking-1",
    startsAt: new Date("2026-07-27T10:00:00.000Z"),
    endsAt: new Date("2026-07-27T11:00:00.000Z"),
    status: "confirmed",
    tenant: { name: "Bukay Demo Salon", slug: "demo" },
    service: { name: "Classic Haircut" },
    client: { name: "Jane Doe" },
    ...overrides,
  };
}

beforeEach(() => {
  process.env.BOOKING_TOKEN_SECRET = SECRET;
  state.bookings = [booking()];
  state.findFirst.mockReset();
  state.findFirst.mockImplementation(
    async (args: { where: { id: string; tenant: { slug: string } } }) =>
      state.bookings.find(
        (row) => row.id === args.where.id && row.tenant.slug === args.where.tenant.slug
      ) ?? null
  );
});

describe("getConfirmedBooking", () => {
  it("returns HTTP 400 when no token is provided", async () => {
    const result = await getConfirmedBooking("demo", undefined);
    expect(result).toEqual({ ok: false, status: 400 });
    expect(state.findFirst).not.toHaveBeenCalled();
  });

  it("returns HTTP 400 for a tampered token", async () => {
    const token = await signBookingToken("booking-1");
    const tampered = token.slice(0, -2) + "aa";

    const result = await getConfirmedBooking("demo", tampered);
    expect(result).toEqual({ ok: false, status: 400 });
  });

  it("returns HTTP 410 for an expired token", async () => {
    const past = Date.now() - 10_000;
    const token = await signBookingTokenPayload({
      bookingId: "booking-1",
      iat: past - BOOKING_TOKEN_TTL_MS,
      exp: past,
    });

    const result = await getConfirmedBooking("demo", token);
    expect(result).toEqual({ ok: false, status: 410 });
  });

  it("returns HTTP 404 when the booking does not belong to the tenant slug", async () => {
    const token = await signBookingToken("booking-1");

    const result = await getConfirmedBooking("someone-else", token);
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("returns the booking details for a valid token", async () => {
    const token = await signBookingToken("booking-1");

    const result = await getConfirmedBooking("demo", token);
    expect(result).toEqual({
      ok: true,
      booking: {
        id: "booking-1",
        startsAt: new Date("2026-07-27T10:00:00.000Z"),
        endsAt: new Date("2026-07-27T11:00:00.000Z"),
        status: "confirmed",
        tenantName: "Bukay Demo Salon",
        tenantSlug: "demo",
        serviceName: "Classic Haircut",
        clientName: "Jane Doe",
      },
    });
  });
});
