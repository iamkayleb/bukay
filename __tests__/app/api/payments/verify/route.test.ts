import { promises as fs } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as verifyRoute from "@/app/api/payments/verify/route";
import { GET as verifyRouteGet } from "@/app/api/payments/verify/route";

describe("GET /api/payments/verify route module", () => {
  it("stays thin and exports only Next.js symbols", async () => {
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
