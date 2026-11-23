import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientsList } from "@/app/(app)/clients/clients-list";
import { merchantEmptyMessages } from "@/app/(app)/merchant-empty-copy";

const state = vi.hoisted(() => ({
  headers: new Map<string, string>(),
  clients: [] as { id: string; tenantId: string; name: string; phone: string }[],
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
    client: {
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
  state.clients = [];
  state.findMany.mockReset();
  state.tenantFindUnique.mockReset();
  state.findMany.mockImplementation(async (args: { where?: { tenantId?: string } }) => {
    const tenantId = args?.where?.tenantId;
    if (!tenantId) {
      throw new Error("Client.findMany requires a top-level tenantId in where");
    }

    return state.clients
      .filter((row) => row.tenantId === tenantId)
      .sort((a, b) => a.name.localeCompare(b.name));
  });
});

describe("ClientsList", () => {
  it("shows the clients empty message when the tenant has no clients", async () => {
    signInAs("tenant-empty");

    const html = renderToStaticMarkup(await ClientsList());

    expect(html).toContain(merchantEmptyMessages.clients);
    expect(html).toContain('data-testid="merchant-empty-state"');
    expect(html).toContain('role="status"');
    expect(html).not.toContain('aria-label="Clients"');
  });

  it("renders client links when rows exist", async () => {
    signInAs("tenant-1");
    state.clients = [
      { id: "client-1", tenantId: "tenant-1", name: "Ada Okonkwo", phone: "+2348000000001" },
    ];

    const html = renderToStaticMarkup(await ClientsList());

    expect(html).toContain("Ada Okonkwo");
    expect(html).toContain("+2348000000001");
    expect(html).toContain('aria-label="Clients"');
    expect(html).toContain('href="/clients/client-1"');
    expect(html).not.toContain(merchantEmptyMessages.clients);
  });
});