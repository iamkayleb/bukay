import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/app/db/prisma";
import { runForTenant, serializeClient, type ClientRecord } from "./_helpers";

export const dynamic = "force-dynamic";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

const clientDelegate = prisma.client as unknown as {
  findMany(args: unknown): Promise<ClientRecord[]>;
};

function parsePositiveInteger(value: string | null, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clientSearchWhere(tenantId: string, search: string, tagId: string | null) {
  const where: Record<string, unknown> = { tenantId };
  const normalizedSearch = search.trim().replace(/\s+/g, " ");

  if (normalizedSearch) {
    where.OR = [
      { name: { startsWith: normalizedSearch } },
      { phone: { startsWith: normalizedSearch.replace(/\s+/g, "") } },
    ];
  }

  if (tagId?.trim()) {
    where.tags = {
      some: {
        tenantId,
        tagId: tagId.trim(),
      },
    };
  }

  return where;
}

export async function GET(req: NextRequest) {
  return runForTenant(req, async (tenantId) => {
    const searchParams = req.nextUrl.searchParams;
    const page = parsePositiveInteger(searchParams.get("page"), 1);
    const pageSize = Math.min(
      parsePositiveInteger(searchParams.get("pageSize"), DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE
    );
    const clients = await clientDelegate.findMany({
      where: clientSearchWhere(
        tenantId,
        searchParams.get("search") ?? "",
        searchParams.get("tagId")
      ),
      include: {
        tags: {
          include: { tag: true },
        },
      },
      orderBy: { name: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    return NextResponse.json({
      ok: true,
      clients: clients.map(serializeClient),
      pagination: { page, pageSize },
    });
  });
}
