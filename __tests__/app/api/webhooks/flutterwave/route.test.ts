import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ recordPaymentSuccess: vi.fn() }));

vi.mock("@/app/lib/ledger", () => ({ recordPaymentSuccess: state.recordPaymentSuccess }));

import { POST, hasValidFlutterwaveSignature } from "@/app/api/webhooks/flutterwave/route";

function webhook(body: unknown, hash?: string) {
  return new NextRequest("http://bukay.test/api/webhooks/flutterwave", {
    method: "POST",
    headers: { "content-type": "application/json", ...(hash ? { "verif-hash": hash } : {}) },
    body: JSON.stringify(body),
  });
}

const completedCharge = {
  event: "charge.completed",
  data: {
    tx_ref: "booking-123",
    status: "successful",
    amount: "150",
    currency: "NGN",
    created_at: "2026-10-02T12:00:00.000Z",
    meta: { tenantId: "tenant-123" },
  },
};

beforeEach(() => {
  process.env.FLUTTERWAVE_WEBHOOK_HASH = "expected-webhook-hash";
  state.recordPaymentSuccess.mockReset().mockResolvedValue({ id: "ledger-1" });
});

describe("POST /api/webhooks/flutterwave", () => {
  it("rejects missing or incorrect webhook signatures", async () => {
    await expect(POST(webhook(completedCharge))).resolves.toMatchObject({ status: 401 });
    await expect(POST(webhook(completedCharge, "wrong-webhook-hash"))).resolves.toMatchObject({
      status: 401,
    });
    expect(state.recordPaymentSuccess).not.toHaveBeenCalled();
  });

  it("records signed successful charges in the shared ledger shape", async () => {
    const response = await POST(webhook(completedCharge, "expected-webhook-hash"));

    expect(response.status).toBe(200);
    expect(state.recordPaymentSuccess).toHaveBeenCalledWith({
      tenantId: "tenant-123",
      amountKobo: 15_000,
      currency: "NGN",
      provider: "flutterwave",
      providerReference: "booking-123",
      paidAt: new Date("2026-10-02T12:00:00.000Z"),
    });
  });

  it("acknowledges signed events that do not represent successful charges", async () => {
    const response = await POST(
      webhook(
        { ...completedCharge, data: { ...completedCharge.data, status: "failed" } },
        "expected-webhook-hash"
      )
    );

    expect(response.status).toBe(200);
    expect(state.recordPaymentSuccess).not.toHaveBeenCalled();
  });
});

describe("hasValidFlutterwaveSignature", () => {
  it("requires equal-length values before comparing the signature", () => {
    expect(hasValidFlutterwaveSignature("expected", "expected")).toBe(true);
    expect(hasValidFlutterwaveSignature("short", "expected")).toBe(false);
  });
});
