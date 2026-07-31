import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TagRow = {
  id: string;
  tenantId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

type ClientRow = {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string;
  notes: string | null;
  tags: ClientTagRow[];
  createdAt: Date;
  updatedAt: Date;
};

type ClientTagRow = {
  id: string;
  tenantId: string;
  clientId: string;
  tagId: string;
  tag: TagRow;
  createdAt: Date;
};

type NextRequestInit = NonNullable<ConstructorParameters<typeof NextRequest>[1]>;

const state = vi.hoisted(() => ({
  clients: [] as ClientRow[],
  tags: [] as TagRow[],
  clientTags: [] as ClientTagRow[],
  tenants: [{ id: "tenant-from-slug", slug: "demo" }],
  clientFindMany: vi.fn(),
  clientFindFirst: vi.fn(),
  tagFindFirst: vi.fn(),
  tagCreate: vi.fn(),
  clientTagFindFirst: vi.fn(),
  clientTagCreate: vi.fn(),
  clientTagDeleteMany: vi.fn(),
  tenantFindUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    client: {
      findMany: state.clientFindMany,
      findFirst: state.clientFindFirst,
    },
    tag: {
      findFirst: state.tagFindFirst,
      create: state.tagCreate,
    },
    clientTag: {
      findFirst: state.clientTagFindFirst,
      create: state.clientTagCreate,
      deleteMany: state.clientTagDeleteMany,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
  },
}));

import { DELETE } from "@/app/api/clients/[id]/tags/[tagId]/route";
import { POST } from "@/app/api/clients/[id]/tags/route";
import { GET } from "@/app/api/clients/route";

const timestamp = new Date("2026-07-01T10:00:00.000Z");

function tag(overrides: Partial<TagRow> = {}): TagRow {
  return {
    id: "tag-1",
    tenantId: "tenant-1",
    name: "VIP",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function client(overrides: Partial<ClientRow> = {}): ClientRow {
  return {
    id: "client-1",
    tenantId: "tenant-1",
    name: "Demo Client",
    email: "client@example.com",
    phone: "+2348000000099",
    notes: null,
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function request(path: string, init: NextRequestInit = {}) {
  return new NextRequest(`http://app.test${path}`, {
    ...init,
    headers: {
      "x-tenant-id": "tenant-1",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

function jsonRequest(path: string, body: unknown, init: NextRequestInit = {}) {
  return request(path, {
    ...init,
    method: init.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  const vip = tag();
  state.clientTags = [
    {
      id: "client-tag-1",
      tenantId: "tenant-1",
      clientId: "client-1",
      tagId: vip.id,
      tag: vip,
      createdAt: timestamp,
    },
  ];
  state.tags = [vip, tag({ id: "tag-2", tenantId: "tenant-2", name: "Other tenant" })];
  state.clients = [
    client({ tags: state.clientTags }),
    client({ id: "client-2", tenantId: "tenant-2", phone: "+2348000000010" }),
  ];

  state.clientFindMany.mockReset();
  state.clientFindFirst.mockReset();
  state.tagFindFirst.mockReset();
  state.tagCreate.mockReset();
  state.clientTagFindFirst.mockReset();
  state.clientTagCreate.mockReset();
  state.clientTagDeleteMany.mockReset();
  state.tenantFindUnique.mockReset();

  state.clientFindMany.mockImplementation(
    async (args: {
      where: {
        tenantId: string;
        OR?: Array<{ name?: { startsWith: string }; phone?: { startsWith: string } }>;
        tags?: { some: { tenantId: string; tagId: string } };
      };
      skip?: number;
      take?: number;
    }) => {
      const filtered = state.clients.filter((row) => {
        if (row.tenantId !== args.where.tenantId) {
          return false;
        }

        if (args.where.OR) {
          const matchesSearch = args.where.OR.some((condition) => {
            if (condition.name) {
              return row.name.startsWith(condition.name.startsWith);
            }

            if (condition.phone) {
              return row.phone.startsWith(condition.phone.startsWith);
            }

            return false;
          });

          if (!matchesSearch) {
            return false;
          }
        }

        if (args.where.tags) {
          return row.tags.some(
            (clientTag) =>
              clientTag.tenantId === args.where.tags?.some.tenantId &&
              clientTag.tagId === args.where.tags.some.tagId
          );
        }

        return true;
      });

      return filtered.slice(args.skip ?? 0, (args.skip ?? 0) + (args.take ?? filtered.length));
    }
  );
  state.clientFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; id: string } }) =>
      state.clients.find(
        (row) => row.tenantId === args.where.tenantId && row.id === args.where.id
      ) ?? null
  );
  state.tagFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; name?: string; id?: string } }) =>
      state.tags.find(
        (row) =>
          row.tenantId === args.where.tenantId &&
          (args.where.name ? row.name === args.where.name : true) &&
          (args.where.id ? row.id === args.where.id : true)
      ) ?? null
  );
  state.tagCreate.mockImplementation(async (args: { data: { tenantId: string; name: string } }) => {
    const row = tag({
      id: `tag-${state.tags.length + 1}`,
      tenantId: args.data.tenantId,
      name: args.data.name,
    });
    state.tags.push(row);
    return row;
  });
  state.clientTagFindFirst.mockImplementation(
    async (args: { where: { tenantId: string; clientId: string; tagId: string } }) =>
      state.clientTags.find(
        (row) =>
          row.tenantId === args.where.tenantId &&
          row.clientId === args.where.clientId &&
          row.tagId === args.where.tagId
      ) ?? null
  );
  state.clientTagCreate.mockImplementation(
    async (args: { data: { tenantId: string; clientId: string; tagId: string } }) => {
      const row = {
        id: `client-tag-${state.clientTags.length + 1}`,
        tenantId: args.data.tenantId,
        clientId: args.data.clientId,
        tagId: args.data.tagId,
        tag: state.tags.find((item) => item.id === args.data.tagId) ?? tag(),
        createdAt: timestamp,
      };
      state.clientTags.push(row);
      return row;
    }
  );
  state.clientTagDeleteMany.mockImplementation(
    async (args: { where: { tenantId: string; clientId: string; tagId: string } }) => {
      const before = state.clientTags.length;
      state.clientTags = state.clientTags.filter(
        (row) =>
          row.tenantId !== args.where.tenantId ||
          row.clientId !== args.where.clientId ||
          row.tagId !== args.where.tagId
      );
      return { count: before - state.clientTags.length };
    }
  );
  state.tenantFindUnique.mockImplementation(
    async (args: { where: { slug: string }; select: { id: boolean } }) =>
      state.tenants.find((tenant) => tenant.slug === args.where.slug) ?? null
  );
});

describe("/api/clients", () => {
  it("lists clients with tags scoped to the request tenant", async () => {
    const res = await GET(request("/api/clients"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    expect(body.clients[0]).toMatchObject({
      id: "client-1",
      tenantId: "tenant-1",
      tags: [{ id: "tag-1", name: "VIP" }],
    });
    expect(state.clientFindMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      include: {
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { name: "asc" },
      skip: 0,
      take: 25,
    });
  });

  it("searches clients through the tenant-scoped Prisma query path with pagination", async () => {
    const res = await GET(request("/api/clients?search=Demo%20%20Client&page=2&pageSize=10"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pagination).toEqual({ page: 2, pageSize: 10 });
    expect(state.clientFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        OR: [{ name: { startsWith: "Demo Client" } }, { phone: { startsWith: "DemoClient" } }],
      },
      include: {
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { name: "asc" },
      skip: 10,
      take: 10,
    });
  });

  it("keeps client search bounded and index-friendly at the API query boundary", async () => {
    const res = await GET(request("/api/clients?search=%20%20%2B234%20800%20%20&pageSize=1000"));

    expect(res.status).toBe(200);
    expect(state.clientFindMany).toHaveBeenCalledTimes(1);

    const query = state.clientFindMany.mock.calls[0][0];
    expect(query).toMatchObject({
      where: {
        tenantId: "tenant-1",
        OR: [{ name: { startsWith: "+234 800" } }, { phone: { startsWith: "+234800" } }],
      },
      orderBy: { name: "asc" },
      skip: 0,
      take: 100,
    });
    expect(JSON.stringify(query)).not.toContain("contains");
  });

  it("keeps 10k-row client search validation on the API route and Prisma delegate boundary", async () => {
    const pageRows = Array.from({ length: 100 }, (_, index) =>
      client({
        id: `client-${index}`,
        name: `Ada Client ${index.toString().padStart(3, "0")}`,
        phone: `+2348000000${index.toString().padStart(3, "0")}`,
      })
    );
    state.clientFindMany.mockResolvedValueOnce(pageRows);

    const startedAt = performance.now();
    const res = await GET(request("/api/clients?search=Ada&pageSize=100"));
    const elapsedMs = performance.now() - startedAt;

    expect(res.status).toBe(200);
    expect(elapsedMs).toBeLessThan(300);
    expect(state.clientFindMany).toHaveBeenCalledTimes(1);
    expect(state.clientFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        OR: [{ name: { startsWith: "Ada" } }, { phone: { startsWith: "Ada" } }],
      },
      include: {
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { name: "asc" },
      skip: 0,
      take: 100,
    });

    const body = await res.json();
    expect(body.clients).toHaveLength(100);
  });

  it("filters clients by reusable tag assignment in the Prisma query", async () => {
    const res = await GET(request("/api/clients?tagId=tag-1&pageSize=500"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.clients).toHaveLength(1);
    expect(body.pagination).toEqual({ page: 1, pageSize: 100 });
    expect(state.clientFindMany).toHaveBeenCalledWith({
      where: {
        tenantId: "tenant-1",
        tags: {
          some: {
            tenantId: "tenant-1",
            tagId: "tag-1",
          },
        },
      },
      include: {
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { name: "asc" },
      skip: 0,
      take: 100,
    });
  });

  it("creates a reusable free-text tag and assigns it to a tenant client", async () => {
    const res = await POST(jsonRequest("/api/clients/client-1/tags", { name: "  Follow   up  " }), {
      params: { id: "client-1" },
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tag).toMatchObject({
      tenantId: "tenant-1",
      name: "Follow up",
    });
    expect(state.tagCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", name: "Follow up" },
    });
    expect(state.clientTagCreate).toHaveBeenCalledWith({
      data: { tenantId: "tenant-1", clientId: "client-1", tagId: "tag-3" },
      include: { tag: true },
    });
  });

  it("reuses an existing tag assignment instead of duplicating it", async () => {
    const res = await POST(jsonRequest("/api/clients/client-1/tags", { name: "VIP" }), {
      params: { id: "client-1" },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tag).toMatchObject({ id: "tag-1", name: "VIP" });
    expect(state.tagCreate).not.toHaveBeenCalled();
    expect(state.clientTagCreate).not.toHaveBeenCalled();
  });

  it("removes a tag assignment only for the request tenant client", async () => {
    const res = await DELETE(request("/api/clients/client-1/tags/tag-1", { method: "DELETE" }), {
      params: { id: "client-1", tagId: "tag-1" },
    });

    expect(res.status).toBe(200);
    expect(state.clientTagDeleteMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", clientId: "client-1", tagId: "tag-1" },
    });
  });

  it("returns not found when assigning a tag to a client outside the request tenant", async () => {
    const res = await POST(jsonRequest("/api/clients/client-2/tags", { name: "VIP" }), {
      params: { id: "client-2" },
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("client_not_found");
    expect(state.clientTagCreate).not.toHaveBeenCalled();
  });
});
