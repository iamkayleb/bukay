import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { createClientSchema } from "@/app/lib/clients/schemas";
import {
  isUniqueConstraintError,
  jsonError,
  readJson,
  runForTenant,
  validationError,
} from "@/app/api/services/_helpers";
import { serializeClient } from "./_helpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const clients = await prisma.client.findMany({
      where: { tenantId },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ ok: true, clients: clients.map(serializeClient) });
  });
}

export async function POST(req: NextRequest) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = createClientSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    try {
      const client = await prisma.client.create({
        data: { tenantId, ...parsed.data },
      });

      return NextResponse.json({ ok: true, client: serializeClient(client) }, { status: 201 });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return jsonError("client_phone_conflict", 409);
      }

      throw error;
    }
  });
}
