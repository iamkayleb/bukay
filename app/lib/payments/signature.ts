import { createHmac, timingSafeEqual } from "node:crypto";

// Paystack signs the raw request body with HMAC-SHA512 using the account's
// secret key and sends the hex digest in the `x-paystack-signature` header.
// https://paystack.com/docs/payments/webhooks/#verifying-webhook-events
export function verifyPaystackSignature(
  rawBody: string,
  signature: string | null | undefined,
  secret: string | null | undefined
): boolean {
  if (!signature || !secret) {
    return false;
  }

  const expected = createHmac("sha512", secret).update(rawBody, "utf8").digest("hex");
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(signature, "utf8");

  if (expectedBytes.length !== providedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, providedBytes);
}

function safeEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a, "utf8");
  const bBytes = Buffer.from(b, "utf8");
  return aBytes.length === bBytes.length && timingSafeEqual(aBytes, bBytes);
}

// Flutterwave authenticates webhooks with the secret hash configured in the
// dashboard. Newer accounts receive `flutterwave-signature` (base64 HMAC-SHA256
// of the raw body keyed by the secret hash); older ones receive `verif-hash`,
// which echoes the secret hash itself.
// https://developer.flutterwave.com/docs/webhooks
export function verifyFlutterwaveSignature(
  rawBody: string,
  headers: { signature?: string | null; verifHash?: string | null },
  secretHash: string | null | undefined
): boolean {
  if (!secretHash) {
    return false;
  }

  if (headers.signature) {
    const expected = createHmac("sha256", secretHash).update(rawBody, "utf8").digest("base64");
    return safeEqual(expected, headers.signature);
  }

  return headers.verifHash ? safeEqual(secretHash, headers.verifHash) : false;
}
