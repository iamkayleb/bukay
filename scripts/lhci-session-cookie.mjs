#!/usr/bin/env node
import { createHmac } from "node:crypto";

const SESSION_COOKIE_NAME = "bukay_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function b64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const secret = process.env.SESSION_SECRET ?? "";
if (!secret || secret.length < 16) {
  console.error("SESSION_SECRET must be set (>=16 chars) to mint an LHCI test session.");
  process.exit(1);
}

const phone = process.env.LHCI_TEST_PHONE ?? "+2348000000000";
const now = Date.now();
const payload = { sub: `user:${phone}`, phone, iat: now, exp: now + SESSION_TTL_MS };
const body = b64url(Buffer.from(JSON.stringify(payload)));
const sig = createHmac("sha256", secret).update(body).digest();
const token = `${body}.${b64url(sig)}`;

process.stdout.write(`${SESSION_COOKIE_NAME}=${token}`);
