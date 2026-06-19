import { prisma } from "@/app/db/prisma";
import type { CreateServiceInput, UpdateServiceInput } from "./schemas";

export type ServiceRecord = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ServiceListFilter = {
  includeInactive?: boolean;
};

export interface ServiceRepository {
  list(tenantId: string, filter?: ServiceListFilter): Promise<ServiceRecord[]>;
  findById(tenantId: string, id: string): Promise<ServiceRecord | null>;
  create(tenantId: string, input: CreateServiceInput): Promise<ServiceRecord>;
  update(tenantId: string, id: string, input: UpdateServiceInput): Promise<ServiceRecord | null>;
  archive(tenantId: string, id: string): Promise<ServiceRecord | null>;
}

function createDataFor(tenantId: string, input: CreateServiceInput) {
  return {
    tenantId,
    name: input.name,
    durationMinutes: input.durationMinutes,
    priceCents: input.priceKobo,
    active: input.active,
  };
}

function updateDataFor(input: UpdateServiceInput) {
  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.durationMinutes !== undefined) data.durationMinutes = input.durationMinutes;
  if (input.priceKobo !== undefined) data.priceCents = input.priceKobo;
  if (input.active !== undefined) data.active = input.active;
  return data;
}

export const prismaServiceRepository: ServiceRepository = {
  list(tenantId, filter = {}) {
    const where: Record<string, unknown> = { tenantId };
    if (!filter.includeInactive) where.active = true;
    return prisma.service.findMany({
      where,
      orderBy: { createdAt: "desc" },
    }) as Promise<ServiceRecord[]>;
  },

  findById(tenantId, id) {
    return prisma.service.findFirst({
      where: { tenantId, id },
    }) as Promise<ServiceRecord | null>;
  },

  create(tenantId, input) {
    return prisma.service.create({
      data: createDataFor(tenantId, input),
    }) as Promise<ServiceRecord>;
  },

  async update(tenantId, id, input) {
    const result = await prisma.service.updateMany({
      where: { tenantId, id },
      data: updateDataFor(input),
    });
    if (result.count === 0) return null;
    return prisma.service.findFirst({
      where: { tenantId, id },
    }) as Promise<ServiceRecord | null>;
  },

  async archive(tenantId, id) {
    const result = await prisma.service.updateMany({
      where: { tenantId, id },
      data: { active: false },
    });
    if (result.count === 0) return null;
    return prisma.service.findFirst({
      where: { tenantId, id },
    }) as Promise<ServiceRecord | null>;
  },
};

let active: ServiceRepository = prismaServiceRepository;

export function getServiceRepository(): ServiceRepository {
  return active;
}

export function setServiceRepositoryForTests(next: ServiceRepository): void {
  active = next;
}

export function __resetServiceRepositoryForTests(): void {
  active = prismaServiceRepository;
}

export function toServiceDto(record: ServiceRecord) {
  return {
    id: record.id,
    name: record.name,
    durationMinutes: record.durationMinutes,
    priceKobo: record.priceCents,
    active: record.active,
    createdAt: record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt,
    updatedAt: record.updatedAt instanceof Date ? record.updatedAt.toISOString() : record.updatedAt,
  };
}
