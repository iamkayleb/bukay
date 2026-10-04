import { beforeEach, describe, expect, it, vi } from "vitest";

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  bufferMinutes: number;
  active: boolean;
};

const state = vi.hoisted(() => ({ services: [] as ServiceRow[] }));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    service: {
      findMany: vi.fn(async (args: { where: { tenantId: string } }) =>
        state.services.filter((service) => service.tenantId === args.where.tenantId)
      ),
    },
  },
}));

import { ServicesList } from "@/app/(app)/services/services-list";

function row(id: string, tenantId: string, name: string, priceKobo = 500000): ServiceRow {
  return { id, tenantId, name, durationMinutes: 45, priceKobo, bufferMinutes: 0, active: true };
}

beforeEach(() => {
  state.services = [];
});

describe("ServicesList", () => {
  it("lists both services of a tenant and none belonging to another tenant", async () => {
    state.services = [
      row("s1", "tenant-1", "Classic Haircut"),
      row("s2", "tenant-1", "Beard Trim"),
      row("s3", "tenant-2", "Other Tenant Facial"),
    ];

    const json = JSON.stringify(await ServicesList({ tenantId: "tenant-1" }));

    expect(json).toContain("Classic Haircut");
    expect(json).toContain("Beard Trim");
    expect(json).not.toContain("Other Tenant Facial");
  });

  it("shows an empty state for a tenant with no services", async () => {
    state.services = [row("s3", "tenant-2", "Other Tenant Facial")];

    const json = JSON.stringify(await ServicesList({ tenantId: "tenant-1" }));

    expect(json).toContain("No services yet");
    expect(json).not.toContain("Other Tenant Facial");
  });
});
