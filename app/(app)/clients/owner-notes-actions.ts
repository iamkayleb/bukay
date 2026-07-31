"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/app/db/prisma";
import {
  SESSION_COOKIE_NAME,
  readSessionTokenFromCookieHeader,
  verifySession,
  type SessionPayload,
} from "@/app/lib/auth/session";
import { resolveTenant } from "@/app/lib/resolve-tenant";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";
import { normalizeClientOwnerNotes } from "./client-profile";

type TenantDelegate = {
  findUnique(args: {
    where: { slug: string };
    select: { id: true };
  }): Promise<{ id: string } | null>;
};

type StaffDelegate = {
  findFirst(args: {
    where: { tenantId: string; phone: string };
    select: { email: true };
  }): Promise<{ email: string | null } | null>;
};

type UserDelegate = {
  findFirst(args: {
    where: { tenantId: string; email: string; role: string };
    select: { id: true };
  }): Promise<{ id: string } | null>;
};

type ClientDelegate = {
  updateMany(args: {
    where: { tenantId: string; id: string };
    data: { notes: string | null };
  }): Promise<{ count: number }>;
};

function currentSession(): SessionPayload | null {
  const cookieStore = cookies();
  const cookieToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const headerToken = readSessionTokenFromCookieHeader(headers().get("cookie"));
  const token = cookieToken ?? headerToken;

  return token ? verifySession(token) : null;
}

export async function resolveTenantIdFromRequest() {
  const headerList = headers();
  const resolved = resolveTenant({
    headers: { get: (name) => headerList.get(name) },
    session: null,
  });

  if (resolved.tenantId?.trim()) {
    return resolved.tenantId.trim();
  }

  if (resolved.tenantSlug?.trim()) {
    const tenant = await (prisma.tenant as unknown as TenantDelegate).findUnique({
      where: { slug: resolved.tenantSlug.trim() },
      select: { id: true },
    });

    return tenant?.id ?? null;
  }

  return null;
}

export async function currentSessionIsTenantOwner(tenantId: string) {
  const session = currentSession();
  if (!session?.phone) {
    return false;
  }

  return runWithTenantContext({ tenantId }, async () => {
    const staff = await (prisma.staff as unknown as StaffDelegate).findFirst({
      where: { tenantId, phone: session.phone },
      select: { email: true },
    });

    if (!staff?.email) {
      return false;
    }

    const owner = await (prisma.user as unknown as UserDelegate).findFirst({
      where: { tenantId, email: staff.email, role: "owner" },
      select: { id: true },
    });

    return owner !== null;
  });
}

export async function updateClientOwnerNotes(clientId: string, formData: FormData) {
  const tenantId = await resolveTenantIdFromRequest();
  if (!tenantId) {
    throw new Error("Tenant is required to update client notes");
  }

  const isOwner = await currentSessionIsTenantOwner(tenantId);
  if (!isOwner) {
    throw new Error("Only tenant owners can update client notes");
  }

  const notes = normalizeClientOwnerNotes(formData.get("notes"));
  const result = await runWithTenantContext({ tenantId }, () =>
    (prisma.client as unknown as ClientDelegate).updateMany({
      where: { tenantId, id: clientId },
      data: { notes },
    })
  );

  if (result.count === 0) {
    throw new Error("Client not found");
  }

  revalidatePath(`/clients/${clientId}`);
}
