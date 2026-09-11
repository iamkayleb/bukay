import { beforeEach, describe, expect, it } from "vitest";

import {
  BOOKING_TOKEN_TTL_MS,
  signBookingToken,
  signBookingTokenPayload,
  verifyBookingToken,
} from "@/app/lib/tokens";

const SECRET = "test-secret-must-be-long-enough";

beforeEach(() => {
  process.env.BOOKING_TOKEN_SECRET = SECRET;
});

describe("booking token signing", () => {
  it("round-trips a booking id through sign/verify", () => {
    const token = signBookingToken("booking-1");
    expect(verifyBookingToken(token)).toEqual({ ok: true, bookingId: "booking-1" });
  });

  it("signs tokens with a 30-day expiry by default", () => {
    const now = Date.now();
    const token = signBookingToken("booking-1");
    const [body] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );

    expect(payload.exp - payload.iat).toBe(BOOKING_TOKEN_TTL_MS);
    expect(payload.exp).toBeGreaterThan(now);
  });

  it("returns HTTP 400 for a tampered token", () => {
    const token = signBookingToken("booking-1");
    const tampered = token.slice(0, -2) + "aa";

    expect(verifyBookingToken(tampered)).toEqual({
      ok: false,
      status: 400,
      reason: "tampered",
    });
  });

  it("returns HTTP 400 for a token signed with a different secret", () => {
    const token = signBookingToken("booking-1", "another-very-long-secret");

    expect(verifyBookingToken(token)).toEqual({
      ok: false,
      status: 400,
      reason: "tampered",
    });
  });

  it("returns HTTP 400 for a malformed token", () => {
    expect(verifyBookingToken("not-a-token")).toEqual({
      ok: false,
      status: 400,
      reason: "malformed",
    });
    expect(verifyBookingToken("")).toEqual({
      ok: false,
      status: 400,
      reason: "malformed",
    });
  });

  it("returns HTTP 410 for an expired token", () => {
    const past = Date.now() - 10_000;
    const token = signBookingTokenPayload({
      bookingId: "booking-1",
      iat: past - BOOKING_TOKEN_TTL_MS,
      exp: past,
    });

    expect(verifyBookingToken(token)).toEqual({
      ok: false,
      status: 410,
      reason: "expired",
    });
  });
});
