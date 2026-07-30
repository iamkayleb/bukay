import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string;
  createdAt: Date;
  _count?: {
    bookings: number;
  };
};

const state = vi.hoisted(() => ({
  clients: [] as ClientRow[],
  clientCount: vi.fn(),
  clientFindMany: vi.fn(),
  tenantFindUnique: vi.fn(),
  headerMap: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  headers: () => ({
    get: (name: string) => state.headerMap.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    client: {
      count: state.clientCount,
      findMany: state.clientFindMany,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
  },
}));

import {
  CLIENTS_PAGE_SIZE,
  buildClientPageHref,
  buildClientWhere,
  normalizeClientPage,
  normalizeClientSearch,
} from "@/app/(app)/clients/client-list";
import ClientsPage from "@/app/(app)/clients/page";

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "client-1",
    tenantId: "tenant-1",
    name: "Ada Okafor",
    email: "ada@example.com",
    phone: "+2348012345678",
    createdAt: new Date("2026-06-01T10:00:00.000Z"),
    _count: { bookings: 3 },
    ...overrides,
  };
}

beforeEach(() => {
  state.clients = [
    client(),
    client({
      id: "client-2",
      name: "Bola Musa",
      email: null,
      phone: "+2348099990000",
      _count: { bookings: 0 },
    }),
  ];
  state.headerMap = new Map([["x-tenant-id", "tenant-1"]]);
  state.clientCount.mockReset();
  state.clientFindMany.mockReset();
  state.tenantFindUnique.mockReset();

  state.clientCount.mockImplementation(
    async (args: { where: { tenantId: string; OR?: unknown } }) =>
      state.clients.filter((row) => row.tenantId === args.where.tenantId).length
  );
  state.clientFindMany.mockImplementation(
    async (args: { where: { tenantId: string }; skip: number; take: number }) =>
      state.clients
        .filter((row) => row.tenantId === args.where.tenantId)
        .slice(args.skip, args.skip + args.take)
  );
  state.tenantFindUnique.mockResolvedValue({ id: "tenant-from-slug" });
});

describe("client list helpers", () => {
  it("normalizes search and page parameters", () => {
    expect(normalizeClientSearch("  Ada   Okafor  ")).toBe("Ada Okafor");
    expect(normalizeClientSearch([" +23480 ", "ignored"])).toBe("+23480");
    expect(normalizeClientPage("3")).toBe(3);
    expect(normalizeClientPage("0")).toBe(1);
    expect(normalizeClientPage("bad")).toBe(1);
  });

  it("builds tenant-scoped name and phone search filters", () => {
    expect(buildClientWhere("tenant-1", "Ada")).toEqual({
      tenantId: "tenant-1",
      OR: [{ name: { contains: "Ada" } }, { phone: { contains: "Ada" } }],
    });
  });

  it("keeps pagination links stable across searches", () => {
    expect(buildClientPageHref(1, "")).toBe("/clients");
    expect(buildClientPageHref(2, "")).toBe("/clients?page=2");
    expect(buildClientPageHref(3, "+23480")).toBe("/clients?q=%2B23480&page=3");
  });
});

describe("/clients page", () => {
  it("queries clients by tenant with server-side search and pagination", async () => {
    const element = await ClientsPage({
      searchParams: { q: " Ada ", page: "2" },
    });

    renderToStaticMarkup(element);

    const expectedWhere = {
      tenantId: "tenant-1",
      OR: [{ name: { contains: "Ada" } }, { phone: { contains: "Ada" } }],
    };
    expect(state.clientCount).toHaveBeenCalledWith({ where: expectedWhere });
    expect(state.clientFindMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: [{ name: "asc" }, { createdAt: "desc" }],
      skip: CLIENTS_PAGE_SIZE,
      take: CLIENTS_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        createdAt: true,
        _count: { select: { bookings: true } },
      },
    });
  });

  it("renders matching clients with booking counts", async () => {
    const element = await ClientsPage({ searchParams: {} });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Client roster");
    expect(html).toContain("Ada Okafor");
    expect(html).toContain("+2348012345678");
    expect(html).toContain("3 bookings");
    expect(html).toContain("Bola Musa");
  });

  it("resolves a tenant slug when no tenant id header is present", async () => {
    state.headerMap = new Map([["host", "demo.example.com"]]);

    await ClientsPage({ searchParams: {} });

    expect(state.tenantFindUnique).toHaveBeenCalledWith({
      where: { slug: "demo" },
      select: { id: true },
    });
    expect(state.clientCount).toHaveBeenCalledWith({ where: { tenantId: "tenant-from-slug" } });
  });
});
