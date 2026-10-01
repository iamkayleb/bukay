import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: { tenant: { findUnique: state.findUnique } },
}));

import { getTenantPaymentConfiguration } from "@/app/lib/payments/tenant-config";

describe("getTenantPaymentConfiguration", () => {
  beforeEach(() => {
    state.findUnique.mockReset();
  });

  it("loads the configured provider using a narrow tenant projection", async () => {
    state.findUnique.mockResolvedValue({ id: "tenant-1", paymentProvider: "FLUTTERWAVE" });

    await expect(getTenantPaymentConfiguration("tenant-1")).resolves.toEqual({
      id: "tenant-1",
      paymentProvider: "FLUTTERWAVE",
    });
    expect(state.findUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      select: { id: true, paymentProvider: true },
    });
  });

  it("preserves a missing tenant result", async () => {
    state.findUnique.mockResolvedValue(null);

    await expect(getTenantPaymentConfiguration("missing")).resolves.toBeNull();
  });

  it("rejects a provider outside the constrained configuration", async () => {
    state.findUnique.mockResolvedValue({ id: "tenant-1", paymentProvider: "unknown" });

    await expect(getTenantPaymentConfiguration("tenant-1")).rejects.toThrow(
      "Tenant tenant-1 has an unsupported payment provider"
    );
  });
});
