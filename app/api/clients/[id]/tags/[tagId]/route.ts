import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { jsonError, runForTenant } from "../../../_helpers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string; tagId: string };
};

const delegates = prisma as unknown as {
  client: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  clientTag: {
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
};

export async function DELETE(req: NextRequest, { params }: RouteContext) {
  return runForTenant(req, async (tenantId) => {
    const client = await delegates.client.findFirst({
      where: { tenantId, id: params.id },
      select: { id: true },
    });

    if (!client) {
      return jsonError("client_not_found", 404);
    }

    const deleted = await delegates.clientTag.deleteMany({
      where: { tenantId, clientId: client.id, tagId: params.tagId },
    });

    if (deleted.count === 0) {
      return jsonError("client_tag_not_found", 404);
    }

    return NextResponse.json({ ok: true });
  });
}
