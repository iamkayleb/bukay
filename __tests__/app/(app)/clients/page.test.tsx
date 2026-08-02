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
  clientTags: Array<{
    tag: {
      name: string;
    };
  }>;
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
  buildClientPageHref,
  buildClientWhere,
  normalizeClientPage,
  normalizeClientSearch,
  normalizeClientTag,
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
    clientTags: [{ tag: { name: "regular" } }],
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
      clientTags: [],
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
    expect(normalizeClientTag(" regular  client ")).toBe("regular client");
    expect(normalizeClientPage("3")).toBe(3);
    expect(normalizeClientPage("0")).toBe(1);
    expect(normalizeClientPage("bad")).toBe(1);
  });

  it("builds tenant-scoped name and phone search filters", () => {
    expect(buildClientWhere("tenant-1", "Ada", "regular")).toEqual({
      tenantId: "tenant-1",
      OR: [{ name: { contains: "Ada" } }, { phone: { contains: "Ada" } }],
      clientTags: {
        some: {
          tenantId: "tenant-1",
          tag: {
            tenantId: "tenant-1",
            name: "regular",
          },
        },
      },
    });
  });

  it("keeps pagination links stable across searches", () => {
    expect(buildClientPageHref(1, "")).toBe("/clients");
    expect(buildClientPageHref(2, "")).toBe("/clients?page=2");
    expect(buildClientPageHref(3, "+23480")).toBe("/clients?q=%2B23480&page=3");
    expect(buildClientPageHref(2, "Ada", "regular")).toBe("/clients?q=Ada&tag=regular&page=2");
  });
});

describe("/clients page", () => {
  it("renders the client profile manager", () => {
    const element = ClientsPage();
    const html = renderToStaticMarkup(element);

    expect(html).toContain("Client profiles");
    expect(html).toContain("Loading clients...");
  });
});
