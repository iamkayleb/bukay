import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { runForTenant, serializeClient, type ClientRecord } from "./_helpers";

export const dynamic = "force-dynamic";

const clientDelegate = prisma.client as unknown as {
  findMany(args: unknown): Promise<ClientRecord[]>;
};

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const clients = await clientDelegate.findMany({
      where: { tenantId },
      include: {
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ ok: true, clients: clients.map(serializeClient) });
  });
}
