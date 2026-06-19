import { describe, expect, it, vi, beforeEach } from "vitest";

const { prismaServiceMock } = vi.hoisted(() => ({
  prismaServiceMock: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
  },
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: { service: prismaServiceMock },
}));

import {
  prismaServiceRepository,
  toServiceDto,
  type ServiceRecord,
} from "@/app/lib/services/repository";

const TENANT = "tenant-acme";

function makeRecord(overrides: Partial<ServiceRecord> = {}): ServiceRecord {
  return {
    id: "svc_1",
    tenantId: TENANT,
    name: "Haircut",
    durationMinutes: 30,
    priceKobo: 250000,
    active: true,
    createdAt: new Date("2026-06-19T10:00:00.000Z"),
    updatedAt: new Date("2026-06-19T10:00:00.000Z"),
    ...overrides,
  };
}

beforeEach(() => {
  prismaServiceMock.findMany.mockReset();
  prismaServiceMock.findFirst.mockReset();
  prismaServiceMock.create.mockReset();
  prismaServiceMock.updateMany.mockReset();
});

describe("prismaServiceRepository.list", () => {
  it("filters by tenantId and excludes inactive by default", async () => {
    prismaServiceMock.findMany.mockResolvedValueOnce([makeRecord()]);
    await prismaServiceRepository.list(TENANT);
    expect(prismaServiceMock.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, active: true },
      orderBy: { createdAt: "desc" },
    });
  });

  it("includes inactive rows when requested", async () => {
    prismaServiceMock.findMany.mockResolvedValueOnce([]);
    await prismaServiceRepository.list(TENANT, { includeInactive: true });
    expect(prismaServiceMock.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT },
      orderBy: { createdAt: "desc" },
    });
  });
});

describe("prismaServiceRepository.findById", () => {
  it("scopes the lookup to the tenant", async () => {
    prismaServiceMock.findFirst.mockResolvedValueOnce(makeRecord());
    await prismaServiceRepository.findById(TENANT, "svc_1");
    expect(prismaServiceMock.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT, id: "svc_1" },
    });
  });
});

describe("prismaServiceRepository.create", () => {
  it("passes priceKobo through as an integer with no scaling", async () => {
    const KOBO = 1234567;
    prismaServiceMock.create.mockResolvedValueOnce(makeRecord({ priceKobo: KOBO }));
    await prismaServiceRepository.create(TENANT, {
      name: "Premium",
      durationMinutes: 60,
      priceKobo: KOBO,
      bufferMinutes: 0,
      active: true,
    });
    expect(prismaServiceMock.create).toHaveBeenCalledWith({
      data: {
        tenantId: TENANT,
        name: "Premium",
        durationMinutes: 60,
        priceKobo: KOBO,
        active: true,
      },
    });
    const calledWith = prismaServiceMock.create.mock.calls[0][0].data;
    expect(Number.isInteger(calledWith.priceKobo)).toBe(true);
  });
});

describe("prismaServiceRepository.update", () => {
  it("only sets fields that are present in the partial input", async () => {
    prismaServiceMock.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaServiceMock.findFirst.mockResolvedValueOnce(makeRecord({ priceKobo: 999 }));

    await prismaServiceRepository.update(TENANT, "svc_1", { priceKobo: 999 });

    expect(prismaServiceMock.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, id: "svc_1" },
      data: { priceKobo: 999 },
    });
  });

  it("returns null when nothing matched", async () => {
    prismaServiceMock.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await prismaServiceRepository.update(TENANT, "missing", { name: "X" });
    expect(result).toBeNull();
    expect(prismaServiceMock.findFirst).not.toHaveBeenCalled();
  });
});

describe("prismaServiceRepository.archive", () => {
  it("soft-deletes by flipping active=false", async () => {
    prismaServiceMock.updateMany.mockResolvedValueOnce({ count: 1 });
    prismaServiceMock.findFirst.mockResolvedValueOnce(makeRecord({ active: false }));

    const result = await prismaServiceRepository.archive(TENANT, "svc_1");

    expect(prismaServiceMock.updateMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT, id: "svc_1" },
      data: { active: false },
    });
    expect(result?.active).toBe(false);
  });

  it("returns null when nothing matched", async () => {
    prismaServiceMock.updateMany.mockResolvedValueOnce({ count: 0 });
    const result = await prismaServiceRepository.archive(TENANT, "missing");
    expect(result).toBeNull();
  });
});

describe("toServiceDto", () => {
  it("preserves priceKobo as an integer through the DTO boundary", () => {
    const dto = toServiceDto(makeRecord({ priceKobo: 1234567 }));
    expect(dto.priceKobo).toBe(1234567);
    expect(Number.isInteger(dto.priceKobo)).toBe(true);
  });

  it("serialises Date timestamps to ISO strings", () => {
    const dto = toServiceDto(makeRecord());
    expect(dto.createdAt).toBe("2026-06-19T10:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-06-19T10:00:00.000Z");
  });
});
