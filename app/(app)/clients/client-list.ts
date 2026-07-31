import { Prisma } from "@prisma/client";

export const CLIENTS_PAGE_SIZE = 25;

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeClientSearch(value: string | string[] | undefined) {
  return firstParam(value)?.trim().replace(/\s+/g, " ") ?? "";
}

export function normalizeClientTag(value: string | string[] | undefined) {
  return firstParam(value)?.trim().replace(/\s+/g, " ") ?? "";
}

export function normalizeClientPage(value: string | string[] | undefined) {
  const parsed = Number(firstParam(value));
  if (!Number.isInteger(parsed) || parsed < 1) {
    return 1;
  }

  return parsed;
}

export function buildClientWhere(
  tenantId: string,
  search: string,
  tag: string = ""
): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = { tenantId };

  if (search) {
    where.OR = [{ name: { contains: search } }, { phone: { contains: search } }];
  }

  if (tag) {
    where.tags = {
      some: {
        tenantId,
        tag: {
          tenantId,
          name: tag,
        },
      },
    };
  }

  return where;
}

export function buildClientPageHref(page: number, search: string, tag: string = "") {
  const params = new URLSearchParams();
  if (search) {
    params.set("q", search);
  }
  if (tag) {
    params.set("tag", tag);
  }
  if (page > 1) {
    params.set("page", String(page));
  }

  const query = params.toString();
  return query ? `/clients?${query}` : "/clients";
}
