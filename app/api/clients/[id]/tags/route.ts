import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { clientTagSchema } from "@/app/lib/clients/tags";
import {
  isUniqueConstraintError,
  jsonError,
  readJson,
  runForTenant,
  serializeTag,
  validationError,
  type TagRecord,
} from "../../_helpers";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: { id: string };
};

type ClientTagAssignmentRecord = {
  tag: TagRecord;
};

const delegates = prisma as unknown as {
  client: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  tag: {
    findFirst(args: unknown): Promise<TagRecord | null>;
    create(args: unknown): Promise<TagRecord>;
  };
  clientTag: {
    findFirst(args: unknown): Promise<ClientTagAssignmentRecord | null>;
    create(args: unknown): Promise<ClientTagAssignmentRecord>;
  };
};

async function findOrCreateTag(tenantId: string, name: string) {
  const existing = await delegates.tag.findFirst({
    where: { tenantId, name },
  });

  if (existing) {
    return existing;
  }

  try {
    return await delegates.tag.create({
      data: { tenantId, name },
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const tag = await delegates.tag.findFirst({
        where: { tenantId, name },
      });
      if (tag) {
        return tag;
      }
    }

    throw error;
  }
}

export async function POST(req: NextRequest, { params }: RouteContext) {
  const body = await readJson(req);
  if (body instanceof NextResponse) {
    return body;
  }

  const parsed = clientTagSchema.safeParse(body);
  if (!parsed.success) {
    return validationError(parsed.error);
  }

  return runForTenant(req, async (tenantId) => {
    const client = await delegates.client.findFirst({
      where: { tenantId, id: params.id },
      select: { id: true },
    });

    if (!client) {
      return jsonError("client_not_found", 404);
    }

    const tag = await findOrCreateTag(tenantId, parsed.data.name);
    const existingAssignment = await delegates.clientTag.findFirst({
      where: { tenantId, clientId: client.id, tagId: tag.id },
      include: { tag: true },
    });

    if (existingAssignment) {
      return NextResponse.json({ ok: true, tag: serializeTag(existingAssignment.tag) });
    }

    try {
      const assignment = await delegates.clientTag.create({
        data: { tenantId, clientId: client.id, tagId: tag.id },
        include: { tag: true },
      });

      return NextResponse.json({ ok: true, tag: serializeTag(assignment.tag) }, { status: 201 });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return NextResponse.json({ ok: true, tag: serializeTag(tag) });
      }

      throw error;
    }
  });
}
