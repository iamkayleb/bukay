import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const HASH = "flw_secret_hash";

const state = vi.hoisted(() => ({
  findPaymentFirst: vi.fn(),
  updatePayment: vi.fn(),
  updateBooking: vi.fn(),
  createDeadLetter: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    payment: { findFirst: state.findPaymentFirst, update: state.updatePayment },
    booking: { update: state.updateBooking },
    deadLetterEvent: { create: state.createDeadLetter },
  },
}));

import { POST } from "@/app/api/webhooks/flutterwave/route";
import { __resetIdempotencyStoreForTests } from "@/app/lib/idempotency";
import { __resetDomainEventsForTests } from "@/app/lib/events";

function request(payload: unknown, headers: Record<string, string> | "signed" = "signed") {
  const body = JSON.stringify(payload);
  const sig = createHmac("sha256", HASH).update(body, "utf8").digest("base64");
  return new NextRequest("http://app.test/api/webhooks/flutterwave", {
    method: "POST",
    headers: headers === "signed" ? { "flutterwave-signature": sig } : headers,
    body,
  });
}

const charge = (status: string) => ({
  event: "charge.completed",
  data: { tx_ref: "ref_1", status, meta: { tenantId: "t1" } },
});

describe("POST /api/webhooks/flutterwave", () => {
  beforeEach(() => {
    vi.stubEnv("FLUTTERWAVE_SECRET_HASH", HASH);
    vi.clearAllMocks();
    __resetIdempotencyStoreForTests();
    __resetDomainEventsForTests();
    state.findPaymentFirst.mockResolvedValue({ id: "p1", bookingId: "b1", tenantId: "t1" });
    state.updateBooking.mockResolvedValue({
      id: "b1",
      staffId: null,
      startsAt: new Date(),
      endsAt: new Date(),
    });
  });

  it("rejects bad or missing signatures", async () => {
    expect((await POST(request(charge("successful"), {}))).status).toBe(401);
    expect((await POST(request(charge("successful"), { "verif-hash": "nope" }))).status).toBe(401);
    expect(state.updatePayment).not.toHaveBeenCalled();
  });

  it("accepts the legacy verif-hash header", async () => {
    const res = await POST(request(charge("successful"), { "verif-hash": HASH }));
    expect(res.status).toBe(200);
  });

  it("marks payment succeeded and confirms booking", async () => {
    const res = await POST(request(charge("successful")));
    expect(await res.json()).toEqual({ ok: true, handled: true });
    expect(state.updatePayment.mock.calls[0][0].data.status).toBe("success");
    expect(state.updateBooking.mock.calls[0][0].data.status).toBe("confirmed");
  });

  it("marks failed charges and replays are idempotent", async () => {
    await POST(request(charge("failed")));
    expect(state.updateBooking.mock.calls[0][0].data.status).toBe("payment_failed");
    const replay = await POST(request(charge("failed")));
    expect(await replay.json()).toEqual({ ok: true, replayed: true });
    expect(state.updatePayment).toHaveBeenCalledTimes(1);
  });

  it("dead-letters unhandled events", async () => {
    const res = await POST(request({ event: "transfer.completed", data: {} }));
    expect(await res.json()).toEqual({ ok: true, handled: false });
    expect(state.createDeadLetter).toHaveBeenCalledOnce();
  });
});
