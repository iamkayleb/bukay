import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Paystack signs webhook bodies with HMAC-SHA512 using the secret key.
 * The hex digest is delivered in the `x-paystack-signature` header.
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

  const provided = signature.trim().toLowerCase();
  const computed = expected.toLowerCase();
  if (provided.length !== computed.length) {
    return false;
  }

  try {
    return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(computed, "utf8"));
  } catch {
    return false;
  }
}
