import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack signs webhook bodies with HMAC-SHA512 using the secret key.
 * The hex digest is delivered in the `x-paystack-signature` header.
 *
 * Flutterwave delivers a static secret hash in the `verif-hash` header that must
 * match the hash configured in the Flutterwave dashboard (not an HMAC of the body).
 */

export function getPaystackSecret(secret?: string): string {
  const value = secret ?? process.env.PAYSTACK_SECRET_KEY ?? "";
  if (!value) {
    throw new Error("PAYSTACK_SECRET_KEY must be set to verify webhook signatures");
  }
  return value;
}

export function signPaystackBody(body: string, secret?: string): string {
  return createHmac("sha512", getPaystackSecret(secret)).update(body, "utf8").digest("hex");
}

function timingSafeStringEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) {
    return false;
  }
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyPaystackSignature(
  body: string,
  signature: string | null | undefined,
  secret?: string
): boolean {
  if (!signature || typeof signature !== "string") {
    return false;
  }

  let expected: string;
  try {
    expected = signPaystackBody(body, secret);
  } catch {
    return false;
  }

  return timingSafeStringEqual(signature.trim().toLowerCase(), expected.toLowerCase());
}

export function getFlutterwaveSecretHash(secretHash?: string): string {
  const value =
    secretHash ?? process.env.FLUTTERWAVE_SECRET_HASH ?? process.env.FLW_SECRET_HASH ?? "";
  if (!value) {
    throw new Error(
      "FLUTTERWAVE_SECRET_HASH (or FLW_SECRET_HASH) must be set to verify webhook signatures"
    );
  }
  return value;
}

/**
 * Flutterwave webhook authenticity: the `verif-hash` header must equal the
 * dashboard secret hash. The body is unused for the check but accepted for a
 * uniform verifier signature alongside Paystack.
 */
export function verifyFlutterwaveSignature(
  _body: string,
  signature: string | null | undefined,
  secretHash?: string
): boolean {
  if (!signature || typeof signature !== "string") {
    return false;
  }

  let expected: string;
  try {
    expected = getFlutterwaveSecretHash(secretHash);
  } catch {
    return false;
  }

  return timingSafeStringEqual(signature.trim(), expected);
}
