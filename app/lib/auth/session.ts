import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "bukay_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionPayload = {
  sub: string;
  phone: string;
  iat: number;
  exp: number;
};

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad), "base64");
}

function getSecret(secret?: string): string {
  const s = secret ?? process.env.SESSION_SECRET ?? "";
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET must be set (>=16 chars) to sign session cookies");
  }
  return s;
}

export function signSession(payload: SessionPayload, secret?: string): string {
  const body = b64urlEncode(Buffer.from(JSON.stringify(payload)));
  const sig = createHmac("sha256", getSecret(secret)).update(body).digest();
  return `${body}.${b64urlEncode(sig)}`;
}

export function verifySession(token: string, secret?: string): SessionPayload | null {
  if (!token || typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);

  let expected: Buffer;
  let provided: Buffer;
  try {
    expected = createHmac("sha256", getSecret(secret)).update(body).digest();
    provided = b64urlDecode(sigPart);
  } catch {
    return null;
  }
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as SessionPayload;
  } catch {
    return null;
  }
  if (!payload || typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
  if (Date.now() >= payload.exp) return null;
  return payload;
}

export type CookieAttrs = {
  maxAgeSeconds?: number;
  secure?: boolean;
  path?: string;
};

export function buildSessionCookie(token: string, attrs: CookieAttrs = {}): string {
  const maxAge = attrs.maxAgeSeconds ?? Math.floor(SESSION_TTL_MS / 1000);
  const secure = attrs.secure ?? process.env.NODE_ENV === "production";
  const path = attrs.path ?? "/";
  const parts = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "HttpOnly",
    "SameSite=Lax",
    `Path=${path}`,
    `Max-Age=${maxAge}`,
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export function buildClearSessionCookie(): string {
  return `${SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`;
}

export function readSessionTokenFromCookieHeader(header: string | null | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === SESSION_COOKIE_NAME) return rest.join("=");
  }
  return null;
}
