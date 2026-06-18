import crypto from "node:crypto";

export const SESSION_COOKIE_NAME = "bukay_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export interface PhoneSession {
  phone: string;
  expiresAt: string;
}

export function createSignedSessionCookieValue(phone: string, now = new Date()): string {
  const expiresAt = new Date(now.getTime() + SESSION_TTL_SECONDS * 1000).toISOString();
  const payload = encodeBase64Url(JSON.stringify({ phone, expiresAt } satisfies PhoneSession));
  const signature = signPayload(payload);

  return `${payload}.${signature}`;
}

export function verifySignedSessionCookieValue(value: string): PhoneSession | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature || !timingSafeEqual(signature, signPayload(payload))) {
    return null;
  }

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as PhoneSession;
    if (
      !session.phone ||
      !session.expiresAt ||
      new Date(session.expiresAt).getTime() <= Date.now()
    ) {
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function signPayload(payload: string): string {
  return crypto.createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET is required in production");
  }

  return "bukay-local-development-session-secret";
}
