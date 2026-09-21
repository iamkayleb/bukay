import { execFileSync } from "node:child_process";
import path from "node:path";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/app/db/prisma";
import { GET } from "@/app/api/payments/verify/route";
import {
  __resetPaymentProviderForTests,
  setPaymentProviderForTests,
} from "@/app/lib/payments/resolve-provider";
import { FakePaymentProvider } from "@/app/lib/payments/fake";
import { PaystackProvider } from "@/app/lib/payments/paystack";
import { createPaystackSubaccount } from "@/app/lib/payments/subaccount";
import { SLOT_HOLD_TTL_MS, releaseHoldForBooking, tryAcquireHold } from "@/app/lib/slot-hold";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

const SECRET = "sk_test_abcdefghijklmnopqrstuvwxyz123456";
const STARTS_AT = new Date("2026-09-16T10:00:00.000Z");

type Seed = {
  tenantId: string;
  serviceId: string;
  clientId: string;
};

let seed: Seed;
let fake: FakePaymentProvider;

function applyMigrations() {
  const prismaBin = path.join(process.cwd(), "node_modules", ".bin", "prisma");
  execFileSync(prismaBin, ["migrate", "deploy"], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "pipe",
  });
}

async function ensureSeed(): Promise<Seed> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo-payments-verify" },
    update: {
      name: "Payments Verify Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
    create: {
      slug: "demo-payments-verify",
      name: "Payments Verify Salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
    },
  });

  const service = await runWithTenantContext({ tenantId: tenant.id }, async () => {
    const existing = await prisma.service.findFirst({
      where: { tenantId: tenant.id, name: "Payment Cut" },
    });
    if (existing) return existing;
    return prisma.service.create({
      data: {
        tenantId: tenant.id,
        name: "Payment Cut",
        durationMinutes: 30,
        priceCents: 10_000_00,
        currency: "NGN",
        active: true,
      },
    });
  });

  const client = await runWithTenantContext({ tenantId: tenant.id }, async () => {
    const existing = await prisma.client.findFirst({
      where: { tenantId: tenant.id, phone: "+2348039990001" },
    });
    if (existing) return existing;
    return prisma.client.create({
      data: {
        tenantId: tenant.id,
        name: "Pay Guest",
        phone: "+2348039990001",
      },
    });
  });

  return { tenantId: tenant.id, serviceId: service.id, clientId: client.id };
}

async function resetTables(tenantId: string) {
  await runWithTenantContext({ tenantId }, async () => {
    await prisma.slotHold.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { tenantId } });
    await prisma.booking.deleteMany({ where: { tenantId } });
  });
}

async function seedPendingBooking(reference: string, split = 15) {
  return runWithTenantContext({ tenantId: seed.tenantId }, async () => {
    const endsAt = new Date(STARTS_AT.getTime() + 30 * 60_000);
    const booking = await prisma.booking.create({
      data: {
        tenantId: seed.tenantId,
        clientId: seed.clientId,
        serviceId: seed.serviceId,
        startsAt: STARTS_AT,
        endsAt,
        status: "pending_payment",
        slotLock: `${seed.serviceId}|${STARTS_AT.toISOString()}`,
      },
    });

    const hold = await tryAcquireHold(
      prisma,
      { tenantId: seed.tenantId, serviceId: seed.serviceId, startsAt: STARTS_AT },
      "session-pay",
      { bookingId: booking.id }
    );
    expect(hold.ok).toBe(true);

    const payment = await prisma.payment.create({
      data: {
        tenantId: seed.tenantId,
        bookingId: booking.id,
        amountCents: 10_000_00,
        currency: "NGN",
        provider: "fake",
        providerRef: reference,
        status: "pending",
      },
    });

    await fake.initialize({
      amountCents: 10_000_00,
      currency: "NGN",
      email: "guest@example.com",
      reference,
      callbackUrl: `https://app.test/api/payments/verify?tenantId=${seed.tenantId}`,
      subaccountCode: "ACCT_tenant",
      platformSplitPercentage: split,
    });

    return { booking, payment };
  });
}

function verifyRequest(reference: string, tenantId: string) {
  const url = new URL("http://app.test/api/payments/verify");
  url.searchParams.set("reference", reference);
  url.searchParams.set("tenantId", tenantId);
  return new NextRequest(url.toString(), { method: "GET" });
}

beforeAll(async () => {
  applyMigrations();
  seed = await ensureSeed();
});

beforeEach(async () => {
  await resetTables(seed.tenantId);
  fake = new FakePaymentProvider();
  setPaymentProviderForTests(fake);
});

afterAll(async () => {
  __resetPaymentProviderForTests();
  await prisma.$disconnect();
});

describe("GET /api/payments/verify", () => {
  it("moves a test-mode payment booking to confirmed", async () => {
    const reference = "pay_success_1";
    const { booking, payment } = await seedPendingBooking(reference, 15);
    fake.succeed(reference, new Date("2026-09-16T12:00:00.000Z"));

    const res = await GET(verifyRequest(reference, seed.tenantId));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      status: "confirmed",
      bookingId: booking.id,
      paymentId: payment.id,
      platformSplitPercentage: 15,
    });

    await runWithTenantContext({ tenantId: seed.tenantId }, async () => {
      const updatedBooking = await prisma.booking.findFirst({
        where: { tenantId: seed.tenantId, id: booking.id },
      });
      const updatedPayment = await prisma.payment.findFirst({
        where: { tenantId: seed.tenantId, id: payment.id },
      });
      expect(updatedBooking?.status).toBe("confirmed");
      expect(updatedPayment?.status).toBe("paid");
      expect(updatedPayment?.paidAt).not.toBeNull();
    });
  });

  it("releases the held slot when payment fails (within the 10-minute hold window)", async () => {
    const reference = "pay_fail_1";
    const { booking } = await seedPendingBooking(reference);
    fake.fail(reference);

    const before = Date.now();
    const res = await GET(verifyRequest(reference, seed.tenantId));
    const elapsedMs = Date.now() - before;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("failed");
    expect(body.slotReleased).toBe(true);
    expect(elapsedMs).toBeLessThan(SLOT_HOLD_TTL_MS);

    await runWithTenantContext({ tenantId: seed.tenantId }, async () => {
      const hold = await prisma.slotHold.findFirst({
        where: { tenantId: seed.tenantId, bookingId: booking.id },
      });
      expect(hold).toBeNull();

      const updatedBooking = await prisma.booking.findFirst({
        where: { tenantId: seed.tenantId, id: booking.id },
      });
      expect(updatedBooking?.status).toBe("cancelled");
      expect(updatedBooking?.slotLock).toBeNull();
    });
  });

  it("requires reference and tenantId", async () => {
    const missingRef = await GET(
      new NextRequest("http://app.test/api/payments/verify?tenantId=t1", { method: "GET" })
    );
    expect(missingRef.status).toBe(400);
    const missingTenant = await GET(
      new NextRequest("http://app.test/api/payments/verify?reference=r1", { method: "GET" })
    );
    expect(missingTenant.status).toBe(400);
  });
});

describe("releaseHoldForBooking", () => {
  it("deletes the hold attached to a booking id", async () => {
    await runWithTenantContext({ tenantId: seed.tenantId }, async () => {
      const acquired = await tryAcquireHold(
        prisma,
        { tenantId: seed.tenantId, serviceId: seed.serviceId, startsAt: STARTS_AT },
        "session-x",
        { bookingId: "booking-x" }
      );
      expect(acquired.ok).toBe(true);
      const released = await releaseHoldForBooking(prisma, seed.tenantId, "booking-x");
      expect(released).toBe(true);
      const remaining = await prisma.slotHold.findFirst({
        where: { tenantId: seed.tenantId, bookingId: "booking-x" },
      });
      expect(remaining).toBeNull();
    });
  });
});

describe("createPaystackSubaccount", () => {
  it("posts percentage_charge and returns the matching split percentage", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            status: true,
            data: {
              subaccount_code: "ACCT_split",
              business_name: "Tenant Salon",
              percentage_charge: 18,
              settlement_bank: "058",
              account_number: "0123456789",
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        )
    );

    const result = await createPaystackSubaccount(
      { secretKey: SECRET, fetchImpl: fetchImpl as unknown as typeof fetch },
      {
        businessName: "Tenant Salon",
        bankCode: "058",
        accountNumber: "0123456789",
        percentageCharge: 18,
      }
    );

    expect(result.percentageCharge).toBe(18);
    expect(result.subaccountCode).toBe("ACCT_split");
    const body = JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string);
    expect(body.percentage_charge).toBe(18);
  });

  it("redacts the secret key from subaccount error messages", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: false, message: `unauthorized ${SECRET}` }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
    );

    await expect(
      createPaystackSubaccount(
        { secretKey: SECRET, fetchImpl: fetchImpl as unknown as typeof fetch },
        {
          businessName: "X",
          bankCode: "058",
          accountNumber: "0123456789",
          percentageCharge: 10,
        }
      )
    ).rejects.toMatchObject({
      message: expect.not.stringContaining(SECRET),
    });
  });
});

describe("PaystackProvider secret logging", () => {
  it("never echoes the secret key when initialize fails", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ status: false, message: `denied ${SECRET}` }), {
          status: 401,
          headers: { "content-type": "application/json" },
        })
    );
    const provider = new PaystackProvider({
      secretKey: SECRET,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.initialize({
        amountCents: 1000,
        currency: "NGN",
        email: "a@b.c",
        reference: "r",
        callbackUrl: "https://example.com/cb",
      })
    ).rejects.toMatchObject({
      message: expect.stringContaining("[REDACTED]"),
    });
  });
});
