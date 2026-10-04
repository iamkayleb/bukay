import { createHmac, timingSafeEqual } from "node:crypto";

// Meta signs the raw webhook body with HMAC-SHA256 keyed by the app secret and
// sends `sha256=<hex>` in `x-hub-signature-256`.
export function verifyMetaSignature(
  rawBody: string,
  signature: string | null | undefined,
  appSecret: string | null | undefined
): boolean {
  if (!signature || !appSecret) return false;

  const expected = `sha256=${createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")}`;
  const expectedBytes = Buffer.from(expected, "utf8");
  const providedBytes = Buffer.from(signature, "utf8");
  if (expectedBytes.length !== providedBytes.length) return false;
  return timingSafeEqual(expectedBytes, providedBytes);
}
