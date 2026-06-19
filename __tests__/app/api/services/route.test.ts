import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/app/db/prisma", () => ({ prisma: {} }));

import { GET, POST } from "@/app/api/services/route";
import { DELETE, GET as GET_ONE, PATCH } from "@/app/api/services/[id]/route";

import { SESSION_TTL_MS, buildSessionCookie, signSession } from "@/app/lib/auth/session";
import {
  __resetServiceRepositoryForTests,
  setServiceRepositoryForTests,
  type ServiceRecord,
  type ServiceRepository,
} from "@/app/lib/services/repository";

const TENANT = "tenant-acme";
const OTHER_TENANT = "tenant-other";

function sessionCookie(): string {
  const now = Date.now();
  const token = signSession({
    sub: "user:+2348031234567",
    phone: "+2348031234567",
    iat: now,
    exp: now + SESSION_TTL_MS,
  });
  return buildSessionCookie(token).split(";")[0];
}

function makeRequest(
  url: string,
  init?: { method?: string; cookie?: string | null; tenant?: string | null; body?: unknown }
) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init?.cookie !== null) headers.cookie = init?.cookie ?? sessionCookie();
  if (init?.tenant !== null) headers["x-tenant-id"] = init?.tenant ?? TENANT;
  const requestInit: { method: string; headers: Record<string, string>; body?: string } = {
    method: init?.method ?? "GET",
    headers,
  };
  if (init?.body !== undefined) {
    requestInit.body = JSON.stringify(init.body);
  }
  return new NextRequest(url, requestInit);
}

function makeRecord(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: "svc_1",
    tenantId: TENANT,
    name: "Haircut",
    durationMinutes: 30,
    priceCents: 500000,
    active: true,
    createdAt: new Date("2026-06-19T10:00:00.000Z"),
    updatedAt: new Date("2026-06-19T10:00:00.000Z"),
    ...overrides,
  };
}

type RepoStub = {
  list: ReturnType<typeof vi.fn>;
  findById: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  archive: ReturnType<typeof vi.fn>;
};

function installRepoStub(): RepoStub {
  const stub: RepoStub = {
    list: vi.fn(),
    findById: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    archive: vi.fn(),
  };
  setServiceRepositoryForTests(stub as unknown as ServiceRepository);
  return stub;
}

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-must-be-long-enough";
  __resetServiceRepositoryForTests();
});

describe("auth + tenant guards", () => {
  it("GET /api/services 401 without session cookie", async () => {
    installRepoStub();
    const res = await GET(makeRequest("http://test/api/services", { cookie: null }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthenticated");
  });

  it("GET /api/services 400 without tenant", async () => {
    installRepoStub();
    const res = await GET(makeRequest("http://test/api/services", { tenant: null }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("tenant_required");
  });
});

describe("GET /api/services", () => {
  it("returns active services scoped to the tenant", async () => {
    const repo = installRepoStub();
    repo.list.mockResolvedValueOnce([
      makeRecord({ id: "svc_1", name: "Haircut" }),
      makeRecord({ id: "svc_2", name: "Beard" }),
    ]);

    const res = await GET(makeRequest("http://test/api/services"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.services).toHaveLength(2);
    expect(body.services[0]).toMatchObject({
      id: "svc_1",
      name: "Haircut",
      priceKobo: 500000,
      durationMinutes: 30,
      active: true,
    });
    expect(repo.list).toHaveBeenCalledWith(TENANT, { includeInactive: false });
  });

  it("forwards includeInactive=true to the repository", async () => {
    const repo = installRepoStub();
    repo.list.mockResolvedValueOnce([]);
    await GET(makeRequest("http://test/api/services?includeInactive=true"));
    expect(repo.list).toHaveBeenCalledWith(TENANT, { includeInactive: true });
  });
});

describe("POST /api/services", () => {
  it("creates a service and returns 201", async () => {
    const repo = installRepoStub();
    repo.create.mockResolvedValueOnce(makeRecord({ id: "svc_new", name: "Massage" }));

    const res = await POST(
      makeRequest("http://test/api/services", {
        method: "POST",
        body: {
          name: "Massage",
          durationMinutes: 45,
          priceKobo: 750000,
        },
      })
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service.id).toBe("svc_new");
    expect(repo.create).toHaveBeenCalledWith(TENANT, {
      name: "Massage",
      durationMinutes: 45,
      priceKobo: 750000,
      bufferMinutes: 0,
      active: true,
    });
  });

  it("returns 400 with field errors on bad payload", async () => {
    const repo = installRepoStub();
    const res = await POST(
      makeRequest("http://test/api/services", {
        method: "POST",
        body: { name: "", durationMinutes: -1, priceKobo: -1 },
      })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.name).toBeDefined();
    expect(body.fieldErrors.durationMinutes).toBeDefined();
    expect(body.fieldErrors.priceKobo).toBeDefined();
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("returns 400 on non-JSON body", async () => {
    const repo = installRepoStub();
    const req = new NextRequest("http://test/api/services", {
      method: "POST",
      headers: {
        cookie: sessionCookie(),
        "x-tenant-id": TENANT,
        "content-type": "application/json",
      },
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("returns 409 when prisma reports a unique constraint", async () => {
    const repo = installRepoStub();
    repo.create.mockRejectedValueOnce(Object.assign(new Error("unique"), { code: "P2002" }));
    const res = await POST(
      makeRequest("http://test/api/services", {
        method: "POST",
        body: { name: "Dup", durationMinutes: 30, priceKobo: 100 },
      })
    );
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.name).toBeDefined();
  });
});

describe("GET /api/services/:id", () => {
  it("returns 200 with the service when found", async () => {
    const repo = installRepoStub();
    repo.findById.mockResolvedValueOnce(makeRecord({ id: "svc_1" }));
    const res = await GET_ONE(makeRequest("http://test/api/services/svc_1"), {
      params: { id: "svc_1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service.id).toBe("svc_1");
    expect(repo.findById).toHaveBeenCalledWith(TENANT, "svc_1");
  });

  it("returns 404 when missing", async () => {
    const repo = installRepoStub();
    repo.findById.mockResolvedValueOnce(null);
    const res = await GET_ONE(makeRequest("http://test/api/services/missing"), {
      params: { id: "missing" },
    });
    expect(res.status).toBe(404);
  });

  it("scopes the lookup to the tenant on the request", async () => {
    const repo = installRepoStub();
    repo.findById.mockResolvedValueOnce(null);
    await GET_ONE(makeRequest("http://test/api/services/svc_1", { tenant: OTHER_TENANT }), {
      params: { id: "svc_1" },
    });
    expect(repo.findById).toHaveBeenCalledWith(OTHER_TENANT, "svc_1");
  });
});

describe("PATCH /api/services/:id", () => {
  it("updates a service and returns the new state", async () => {
    const repo = installRepoStub();
    repo.update.mockResolvedValueOnce(
      makeRecord({ id: "svc_1", name: "Renamed", priceCents: 999 })
    );
    const res = await PATCH(
      makeRequest("http://test/api/services/svc_1", {
        method: "PATCH",
        body: { name: "Renamed", priceKobo: 999 },
      }),
      { params: { id: "svc_1" } }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service.name).toBe("Renamed");
    expect(body.service.priceKobo).toBe(999);
    expect(repo.update).toHaveBeenCalledWith(TENANT, "svc_1", {
      name: "Renamed",
      priceKobo: 999,
    });
  });

  it("returns 400 on validation failure", async () => {
    const repo = installRepoStub();
    const res = await PATCH(
      makeRequest("http://test/api/services/svc_1", {
        method: "PATCH",
        body: { durationMinutes: -10 },
      }),
      { params: { id: "svc_1" } }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("validation_failed");
    expect(body.fieldErrors.durationMinutes).toBeDefined();
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("returns 400 on empty payload", async () => {
    const repo = installRepoStub();
    const res = await PATCH(
      makeRequest("http://test/api/services/svc_1", { method: "PATCH", body: {} }),
      { params: { id: "svc_1" } }
    );
    expect(res.status).toBe(400);
    expect(repo.update).not.toHaveBeenCalled();
  });

  it("returns 404 when no service matches", async () => {
    const repo = installRepoStub();
    repo.update.mockResolvedValueOnce(null);
    const res = await PATCH(
      makeRequest("http://test/api/services/svc_404", {
        method: "PATCH",
        body: { name: "Whatever" },
      }),
      { params: { id: "svc_404" } }
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/services/:id (soft delete)", () => {
  it("archives a service via active=false", async () => {
    const repo = installRepoStub();
    repo.archive.mockResolvedValueOnce(makeRecord({ id: "svc_1", active: false }));
    const res = await DELETE(makeRequest("http://test/api/services/svc_1", { method: "DELETE" }), {
      params: { id: "svc_1" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.service.active).toBe(false);
    expect(repo.archive).toHaveBeenCalledWith(TENANT, "svc_1");
  });

  it("returns 404 when archiving a missing service", async () => {
    const repo = installRepoStub();
    repo.archive.mockResolvedValueOnce(null);
    const res = await DELETE(
      makeRequest("http://test/api/services/missing", { method: "DELETE" }),
      { params: { id: "missing" } }
    );
    expect(res.status).toBe(404);
  });
});
