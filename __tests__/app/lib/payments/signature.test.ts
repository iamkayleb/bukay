import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { verifyPaystackSignature } from "@/app/lib/payments/signature";

const SECRET = "sk_test_secret";

function sign(body: string, secret: string): string {
  return createHmac("sha512", secret).update(body, "utf8").digest("hex");
}

describe("verifyPaystackSignature", () => {
  it("accepts a signature produced with the correct secret", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackSignature(body, sign(body, SECRET), SECRET)).toBe(true);
  });

  it("rejects a signature produced with the wrong secret", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackSignature(body, sign(body, "sk_test_other"), SECRET)).toBe(false);
  });

  it("rejects a signature for a mutated body", () => {
    const body = JSON.stringify({ event: "charge.success" });
    const tampered = JSON.stringify({ event: "charge.failed" });
    expect(verifyPaystackSignature(tampered, sign(body, SECRET), SECRET)).toBe(false);
  });

  it("rejects when the signature header is missing", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackSignature(body, null, SECRET)).toBe(false);
  });

  it("rejects when the secret is not configured", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackSignature(body, sign(body, SECRET), undefined)).toBe(false);
  });

  it("rejects a signature of a different length without throwing", () => {
    const body = JSON.stringify({ event: "charge.success" });
    expect(verifyPaystackSignature(body, "short", SECRET)).toBe(false);
  });
});
