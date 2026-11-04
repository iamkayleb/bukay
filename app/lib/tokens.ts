// Uses the Web Crypto API (globalThis.crypto.subtle) instead of node:crypto
// so this module works unmodified in Next.js Middleware (Edge runtime),
// which is where token verification needs to run to produce real HTTP
// 400/410 responses for the booking confirmation link.

export const BOOKING_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const HMAC_ALGORITHM = { name: "HMAC", hash: "SHA-256" };

export type BookingTokenPayload = {
  bookingId: string;
  iat: number;
  exp: number;
};

export type BookingTokenVerifyResult =
  | { ok: true; bookingId: string }
  | { ok: false; status: 400; reason: "malformed" | "tampered" }
  | { ok: false; status: 410; reason: "expired" };

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getSecret(secret?: string): string {
  const s = secret ?? process.env.BOOKING_TOKEN_SECRET ?? process.env.SESSION_SECRET ?? "";
  if (!s || s.length < 16) {
    throw new Error("BOOKING_TOKEN_SECRET must be set (>=16 chars) to sign booking tokens");
  }
  return s;
}

function importHmacKey(secret: string, usages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    HMAC_ALGORITHM,
    false,
    usages
  );
}

export async function signBookingTokenPayload(
  payload: BookingTokenPayload,
  secret?: string
): Promise<string> {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importHmacKey(getSecret(secret), ["sign"]);
  const sig = await crypto.subtle.sign(HMAC_ALGORITHM, key, new TextEncoder().encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

export async function signBookingToken(bookingId: string, secret?: string): Promise<string> {
  const now = Date.now();
  return signBookingTokenPayload({ bookingId, iat: now, exp: now + BOOKING_TOKEN_TTL_MS }, secret);
}

export async function verifyBookingToken(
  token: string | undefined,
  secret?: string
): Promise<BookingTokenVerifyResult> {
  if (!token || typeof token !== "string") {
    return { ok: false, status: 400, reason: "malformed" };
  }

  const dot = token.indexOf(".");
  if (dot <= 0) {
    return { ok: false, status: 400, reason: "malformed" };
  }

  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = base64UrlToBytes(sigPart);
  } catch {
    return { ok: false, status: 400, reason: "malformed" };
  }

  const key = await importHmacKey(getSecret(secret), ["verify"]);
  const valid = await crypto.subtle.verify(
    HMAC_ALGORITHM,
    key,
    sigBytes,
    new TextEncoder().encode(body)
  );

  if (!valid) {
    return { ok: false, status: 400, reason: "tampered" };
  }

  let payload: BookingTokenPayload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as BookingTokenPayload;
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
