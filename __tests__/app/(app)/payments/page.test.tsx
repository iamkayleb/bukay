import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import PaymentsPage from "@/app/(app)/payments/page";
import { merchantEmptyMessages } from "@/app/(app)/merchant-empty-copy";

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  payments: [] as {
    id: string;
    tenantId: string;
    amountCents: number;
    currency: string;
    status: string;
    createdAt: Date;
    booking: { client: { name: string }; service: { name: string } };
  }[],
  findMany: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => state.headers.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    payment: {
      findMany: (...args: unknown[]) => state.findMany(...args),
    },
    tenant: {
      findUnique: (...args: unknown[]) => state.tenantFindUnique(...args),
    },
  },
}));

function signInAs(tenantId: string) {
  state.headers.set("x-tenant-id", tenantId);
}

beforeEach(() => {
  state.headers.clear();
  state.payments = [];
  state.findMany.mockReset();
  state.tenantFindUnique.mockReset();
  state.findMany.mockImplementation(async (args: { where?: { tenantId?: string } }) => {
    const tenantId = args?.where?.tenantId;
    if (!tenantId) {
      throw new Error("Payment.findMany requires a top-level tenantId in where");
    }

    return state.payments
      .filter((row) => row.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  });
});

describe("PaymentsPage", () => {
  it("shows the empty-state message when the tenant has no payments", async () => {
    signInAs("tenant-empty");

    const html = renderToStaticMarkup(await PaymentsPage());

    expect(html).toContain(merchantEmptyMessages.payments);
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-label="Payments"');
  });

  it("lists payments when the tenant has data", async () => {
    signInAs("tenant-demo");
    state.payments = [
      {
        id: "pay-1",
        tenantId: "tenant-demo",
        amountCents: 5000,
        currency: "NGN",
        status: "paid",
        createdAt: new Date("2026-10-04T09:00:00.000Z"),
        booking: {
          client: { name: "Ada Okonkwo" },
          service: { name: "Classic Haircut" },
        },
      },
    ];

    const html = renderToStaticMarkup(await PaymentsPage());

    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("paid");
    expect(html).not.toContain(merchantEmptyMessages.payments);
  });
});