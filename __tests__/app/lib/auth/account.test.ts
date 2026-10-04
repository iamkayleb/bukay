import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

type TenantRow = { id: string; name: string; slug: string };
type UserRow = { id: string; tenantId: string; phone: string };

const state = vi.hoisted(() => ({
  tenants: [] as TenantRow[],
  users: [] as UserRow[],
  tenantCreate: vi.fn(),
  userFindUnique: vi.fn(),
}));

vi.mock("@/app/lib/auth/account-db", () => ({
  accountPrisma: {
    tenant: { create: state.tenantCreate },
    user: { findUnique: state.userFindUnique },
  },
}));

import { findOrCreateAccount } from "@/app/lib/auth/account";

beforeEach(() => {
  state.tenants = [];
  state.users = [];
  state.tenantCreate.mockReset();
  state.userFindUnique.mockReset();

  state.userFindUnique.mockImplementation(
    async ({ where }: { where: { phone: string } }) =>
      state.users.find((user) => user.phone === where.phone) ?? null
  );
  state.tenantCreate.mockImplementation(
    async ({
      data,
    }: {
      data: Omit<TenantRow, "id"> & { users: { create: Omit<UserRow, "id" | "tenantId"> } };
    }) => {
      const tenant = { id: `tenant-${state.tenants.length + 1}`, ...data };
      state.tenants.push(tenant);
      const user = {
        id: `user-${state.users.length + 1}`,
        tenantId: tenant.id,
        ...data.users.create,
      };
      state.users.push(user);
      return { ...tenant, users: [{ id: user.id }] };
    }
  );
});

describe("findOrCreateAccount", () => {
  it("creates one tenant and its owner for a first sign-in", async () => {
    const account = await findOrCreateAccount("+2348031234567");

    expect(account).toEqual({ userId: "user-1", tenantId: "tenant-1" });
    expect(state.tenants).toHaveLength(1);
    expect(state.tenants[0]).toMatchObject({ name: "My business" });
    expect(state.tenants[0].slug).toMatch(/^business-[a-f0-9]{32}$/);
    expect(state.users).toEqual([
      expect.objectContaining({
        id: "user-1",
        tenantId: "tenant-1",
        phone: "+2348031234567",
      }),
    ]);
  });

  it("reuses the existing user and tenant for a repeat sign-in", async () => {
    const first = await findOrCreateAccount("+2348031234567");
    const second = await findOrCreateAccount("+2348031234567");

    expect(second).toEqual(first);
    expect(state.tenants).toHaveLength(1);
    expect(state.users).toHaveLength(1);
    expect(state.tenantCreate).toHaveBeenCalledTimes(1);
  });

  it("reuses the account created by a concurrent verification", async () => {
    state.tenantCreate.mockImplementationOnce(async () => {
      state.users.push({
        id: "user-created-concurrently",
        tenantId: "tenant-created-concurrently",
        phone: "+2348031234567",
      });
      throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      });
    });

    await expect(findOrCreateAccount("+2348031234567")).resolves.toEqual({
      userId: "user-created-concurrently",
      tenantId: "tenant-created-concurrently",
    });
    expect(state.tenantCreate).toHaveBeenCalledTimes(1);
  });
});
