import { beforeEach, describe, expect, it, vi } from "vitest";

type TenantRow = { id: string; name: string; slug: string };
type UserRow = { id: string; tenantId: string; phone: string; email: string; role: string };

const db = vi.hoisted(() => ({
  tenants: [] as TenantRow[],
  users: [] as UserRow[],
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findFirst: async ({ where }: { where: { users: { some: { phone: string } } } }) => {
        const user = db.users.find((u) => u.phone === where.users.some.phone);
        return user ? { id: user.tenantId } : null;
      },
      create: async ({
        data,
      }: {
        data: { name: string; slug: string; users: { create: Omit<UserRow, "id" | "tenantId"> } };
      }) => {
        const id = `t${db.tenants.length + 1}`;
        db.tenants.push({ id, name: data.name, slug: data.slug });
        const user = { id: `u${db.users.length + 1}`, tenantId: id, ...data.users.create };
        db.users.push(user);
        return { id, users: [{ id: user.id }] };
      },
    },
    user: {
      findFirst: async ({ where }: { where: { tenantId: string; phone: string } }) =>
        db.users.find((u) => u.tenantId === where.tenantId && u.phone === where.phone) ?? null,
    },
  },
}));

import { findOrCreateAccount } from "@/app/lib/auth/account";

const PHONE = "+2348031234567";

beforeEach(() => {
  db.tenants.length = 0;
  db.users.length = 0;
});

describe("findOrCreateAccount", () => {
  it("creates one tenant and one owner user on first sign-in", async () => {
    const account = await findOrCreateAccount(PHONE);

    expect(db.tenants).toHaveLength(1);
    expect(db.users).toHaveLength(1);
    expect(db.tenants[0].slug).toMatch(/^biz-4567-[0-9a-f]{8}$/);
    expect(db.users[0]).toMatchObject({ phone: PHONE, role: "owner", tenantId: db.tenants[0].id });
    expect(account).toEqual({ userId: db.users[0].id, tenantId: db.tenants[0].id, created: true });
  });

  it("reuses the existing rows on a repeat sign-in", async () => {
    const first = await findOrCreateAccount(PHONE);
    const second = await findOrCreateAccount(PHONE);

    expect(db.tenants).toHaveLength(1);
    expect(db.users).toHaveLength(1);
    expect(second).toEqual({ ...first, created: false });
  });

  it("gives a different phone its own tenant", async () => {
    await findOrCreateAccount(PHONE);
    await findOrCreateAccount("+2348039999999");
    expect(db.tenants).toHaveLength(2);
    expect(new Set(db.tenants.map((t) => t.slug)).size).toBe(2);
  });
});
