import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

type ServiceRow = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  bufferMinutes: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const state = vi.hoisted(() => ({ services: [] as ServiceRow[], refresh: vi.fn() }));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    service: {
      findMany: vi.fn(async (args: { where: { tenantId: string } }) =>
        state.services.filter((service) => service.tenantId === args.where.tenantId)
      ),
      create: vi.fn(
        async ({ data }: { data: Omit<ServiceRow, "id" | "createdAt" | "updatedAt"> }) => {
          const row = {
            ...data,
            id: `s${state.services.length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          state.services.push(row);
          return row;
        }
      ),
    },
  },
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [initial, vi.fn()],
}));

import { POST } from "@/app/api/services/route";
import { ServiceForm } from "@/app/(app)/services/service-form";
import { ServicesList } from "@/app/(app)/services/services-list";

type FormElement = { type: string; props: { onSubmit: (event: unknown) => void } };

beforeEach(() => {
  state.services = [];
  state.refresh.mockClear();
});

describe("ServiceForm", () => {
  it("posts the form to the services endpoint and the new service appears in the list", async () => {
    vi.stubGlobal(
      "fetch",
      async (
        url: string,
        init: { method: string; body: string; headers: Record<string, string> }
      ) => {
        expect(url).toBe("/api/services");
        return POST(
          new NextRequest(`http://app.test${url}`, {
            method: init.method,
            body: init.body,
            headers: { ...init.headers, "x-tenant-id": "tenant-1" },
          })
        );
      }
    );

    const form = ServiceForm() as unknown as FormElement;
    expect(form.type).toBe("form");

    const values: Record<string, string> = {
      name: " Deluxe Braids ",
      durationMinutes: "90",
      priceNaira: "12500.50",
      bufferMinutes: "15",
    };
    const reset = vi.fn();
    vi.stubGlobal(
      "FormData",
      class {
        get(key: string) {
          return values[key] ?? null;
        }
      }
    );
    form.props.onSubmit({ preventDefault: vi.fn(), currentTarget: { reset } });
    await vi.waitFor(() => expect(state.refresh).toHaveBeenCalled());

    expect(reset).toHaveBeenCalled();
    expect(state.services).toHaveLength(1);
    expect(state.services[0]).toMatchObject({
      tenantId: "tenant-1",
      name: "Deluxe Braids",
      durationMinutes: 90,
      priceKobo: 1250050,
      bufferMinutes: 15,
    });

    const json = JSON.stringify(await ServicesList({ tenantId: "tenant-1" }));
    expect(json).toContain("Deluxe Braids");
    expect(JSON.stringify(await ServicesList({ tenantId: "tenant-2" }))).not.toContain(
      "Deluxe Braids"
    );
  });
});
