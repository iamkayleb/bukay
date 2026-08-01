import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  clientUpdateMany: vi.fn(),
  revalidatePath: vi.fn(),
  staffFindFirst: vi.fn(),
  tenantFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  cookieMap: new Map<string, { value: string }>(),
  headerMap: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string) => state.cookieMap.get(name),
  }),
  headers: () => ({
    get: (name: string) => state.headerMap.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("next/cache", () => ({
  revalidatePath: state.revalidatePath,
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    client: {
      updateMany: state.clientUpdateMany,
    },
    staff: {
      findFirst: state.staffFindFirst,
    },
    tenant: {
      findUnique: state.tenantFindUnique,
    },
    user: {
      findFirst: state.userFindFirst,
    },
  },
}));

import {
  currentSessionIsTenantOwner,
  updateClientOwnerNotes,
} from "@/app/(app)/clients/owner-notes-actions";
import { SESSION_COOKIE_NAME, SESSION_TTL_MS, signSession } from "@/app/lib/auth/session";

const PREVIOUS_SECRET = process.env.SESSION_SECRET;

function ownerSessionCookie() {
  const now = Date.now();
  return signSession({
    sub: "user:+2348000000001",
    phone: "+2348000000001",
    iat: now,
    exp: now + SESSION_TTL_MS,
  });
}

beforeEach(() => {
  process.env.SESSION_SECRET = "test-secret-value-1234567890";
  state.cookieMap = new Map([[SESSION_COOKIE_NAME, { value: ownerSessionCookie() }]]);
  state.headerMap = new Map([["x-tenant-id", "tenant-1"]]);
  state.clientUpdateMany.mockReset();
  state.revalidatePath.mockReset();
  state.staffFindFirst.mockReset();
  state.tenantFindUnique.mockReset();
  state.userFindFirst.mockReset();
  state.clientUpdateMany.mockResolvedValue({ count: 1 });
  state.staffFindFirst.mockResolvedValue({ email: "owner@demo.bukay.dev" });
  state.tenantFindUnique.mockResolvedValue({ id: "tenant-from-slug" });
  state.userFindFirst.mockResolvedValue({ id: "owner-1" });
});

afterEach(() => {
  process.env.SESSION_SECRET = PREVIOUS_SECRET;
});

describe("owner notes actions", () => {
  it("updates client notes for tenant owners only", async () => {
    const formData = new FormData();
    formData.set("notes", "  Prefers morning appointments.  ");

    await updateClientOwnerNotes("client-1", formData);

    expect(state.staffFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", phone: "+2348000000001" },
      select: { email: true },
    });
    expect(state.userFindFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", email: "owner@demo.bukay.dev", role: "owner" },
      select: { id: true },
    });
    expect(state.clientUpdateMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", id: "client-1" },
      data: { notes: "Prefers morning appointments." },
    });
    expect(state.revalidatePath).toHaveBeenCalledWith("/clients/client-1");
  });

  it("rejects non-owner note updates", async () => {
    state.userFindFirst.mockResolvedValue(null);

    const formData = new FormData();
    formData.set("notes", "Hidden from staff.");

    await expect(updateClientOwnerNotes("client-1", formData)).rejects.toThrowError(
      "Only tenant owners can update client notes"
    );
    expect(state.clientUpdateMany).not.toHaveBeenCalled();
  });

  it("returns false when the session phone is not linked to owner staff", async () => {
    state.staffFindFirst.mockResolvedValue(null);

    await expect(currentSessionIsTenantOwner("tenant-1")).resolves.toBe(false);
    expect(state.userFindFirst).not.toHaveBeenCalled();
  });
});
