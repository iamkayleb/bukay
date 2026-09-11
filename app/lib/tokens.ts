import { createHmac, timingSafeEqual } from "node:crypto";

export const BOOKING_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type BookingTokenPayload = {
  bookingId: string;
  iat: number;
  exp: number;
};

export type BookingTokenVerifyResult =
  | { ok: true; bookingId: string }
  | { ok: false; status: 400; reason: "malformed" | "tampered" }
  | { ok: false; status: 410; reason: "expired" };

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad), "base64");
}

function getSecret(secret?: string): string {
  const s = secret ?? process.env.BOOKING_TOKEN_SECRET ?? process.env.SESSION_SECRET ?? "";
  if (!s || s.length < 16) {
    throw new Error("BOOKING_TOKEN_SECRET must be set (>=16 chars) to sign booking tokens");
  }
  return s;
}

export function signBookingTokenPayload(payload: BookingTokenPayload, secret?: string): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", getSecret(secret)).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

export function signBookingToken(bookingId: string, secret?: string): string {
  const now = Date.now();
  return signBookingTokenPayload({ bookingId, iat: now, exp: now + BOOKING_TOKEN_TTL_MS }, secret);
}

export function verifyBookingToken(token: string, secret?: string): BookingTokenVerifyResult {
  if (!token || typeof token !== "string") {
    return { ok: false, status: 400, reason: "malformed" };
  }

  const dot = token.indexOf(".");
  if (dot <= 0) {
    return { ok: false, status: 400, reason: "malformed" };
  }

  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = createHmac("sha256", getSecret(secret)).update(body).digest();
    provided = b64urlDecode(sigPart);
  } catch {
    return { ok: false, status: 400, reason: "malformed" };
  }

  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, status: 400, reason: "tampered" };
  }

  let payload: BookingTokenPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as BookingTokenPayload;
  } catch {
    return { ok: false, status: 400, reason: "malformed" };
  }

  if (!payload || typeof payload.bookingId !== "string" || typeof payload.exp !== "number") {
    return { ok: false, status: 400, reason: "malformed" };
  }

  if (Date.now() >= payload.exp) {
    return { ok: false, status: 410, reason: "expired" };
  }

  return { ok: true, bookingId: payload.bookingId };
}
