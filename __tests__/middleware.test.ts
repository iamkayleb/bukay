import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { middleware } from "@/middleware";
import { BOOKING_TOKEN_TTL_MS, signBookingToken, signBookingTokenPayload } from "@/app/lib/tokens";

const SECRET = "test-secret-must-be-long-enough";

beforeEach(() => {
  process.env.BOOKING_TOKEN_SECRET = SECRET;
});

function requestFor(query: string) {
  return new NextRequest(`https://bukay.test/demo/book/confirmed${query}`);
}

describe("booking confirmation middleware", () => {
  it("lets a valid token through to the page", async () => {
    const token = await signBookingToken("booking-1");

    const res = await middleware(requestFor(`?token=${token}`));

    expect(res.status).toBe(200);
  });

  it("returns HTTP 400 when no token is present", async () => {
    const res = await middleware(requestFor(""));

    expect(res.status).toBe(400);
    expect(await res.text()).toContain("invalid");
  });

  it("returns HTTP 400 for a tampered token", async () => {
    const token = await signBookingToken("booking-1");
    const tampered = token.slice(0, -2) + "aa";

    const res = await middleware(requestFor(`?token=${tampered}`));

    expect(res.status).toBe(400);
  });

  it("returns HTTP 410 for an expired token", async () => {
    const past = Date.now() - 10_000;
    const token = await signBookingTokenPayload({
      bookingId: "booking-1",
      iat: past - BOOKING_TOKEN_TTL_MS,
      exp: past,
    });

    const res = await middleware(requestFor(`?token=${token}`));

    expect(res.status).toBe(410);
    expect(await res.text()).toContain("expired");
  });
});
