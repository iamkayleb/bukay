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
