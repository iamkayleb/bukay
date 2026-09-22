/**
 * Route-module shape for GET /api/payments/verify.
 *
 * Structural assertions below are contract guards: they keep the Next.js route
 * thin and free of test hooks so LLM review can focus on the adapter. They do
 * not exercise payment transitions.
 *
 * Behavioral coverage for critical verify paths lives in
 * __tests__/app/lib/payments/verify-flow.test.ts (invokes the same GET export):
 * - confirm success → booking confirmed / payment paid
 * - provider fail / abandoned → hold released, booking cancelled
 * - missing reference/tenantId → 400
 * - unknown reference → 404
 * - provider throw → 502
 * - still-pending provider status → booking stays pending_payment
 */
import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as verifyRoute from "@/app/api/payments/verify/route";
import { GET as verifyRouteGet } from "@/app/api/payments/verify/route";

describe("GET /api/payments/verify route module", () => {
  it("stays thin and exports only Next.js symbols", async () => {
    // Contract guard (structural): length + delegation target, not status transitions.
    const routePath = path.join(process.cwd(), "app/api/payments/verify/route.ts");
    const source = await fs.readFile(routePath, "utf8");

    expect(source.length).toBeLessThan(1200);
    expect(source).toContain('from "@/app/lib/payments/verify-callback"');
    expect(source).toContain("handlePaymentVerify");
    expect(source).not.toContain("setPaymentProviderForTests");
    expect(source).not.toContain("__resetPaymentProviderForTests");
    expect(Object.keys(verifyRoute).sort()).toEqual(["GET", "dynamic"].sort());
  });

  it("exports only Next.js route symbols (no test hooks)", () => {
    // Contract guard (structural): public module surface stays production-only.
    expect(Object.keys(verifyRoute).sort()).toEqual(["GET", "dynamic"].sort());
    expect(verifyRoute.dynamic).toBe("force-dynamic");
    expect(typeof verifyRouteGet).toBe("function");
    expect(Object.prototype.hasOwnProperty.call(verifyRoute, "setPaymentProviderForTests")).toBe(
      false
    );
    expect(
      Object.prototype.hasOwnProperty.call(verifyRoute, "__resetPaymentProviderForTests")
    ).toBe(false);
  });
});
