import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import {
  computeSlots,
  type AvailabilityBooking,
  type AvailabilityHours,
} from "@/app/lib/availability";
import { defineAgentTool, type AgentRuntimeContext, type AgentTool } from "@/app/lib/agent/runtime";

export const availabilityToolInputSchema = z
  .object({
    serviceId: z.string().trim().min(1),
    startDate: z.string().datetime(),
    endDate: z.string().datetime(),
    // A tenant is supplied by the runtime, never by the model. Accepting this
    // field only lets callers receive an explicit authorization failure rather
    // than accidentally performing a cross-tenant lookup.
    tenantId: z.string().trim().min(1).optional(),
  })
  .strict();

export type AvailabilityToolInput = z.infer<typeof availabilityToolInputSchema>;

export interface AvailabilityToolService {
  id: string;
  durationMinutes: number;
}

export interface AvailabilityToolRepository {
  findService(tenantId: string, serviceId: string): Promise<AvailabilityToolService | null>;
  listBusinessHours(tenantId: string): Promise<AvailabilityHours[]>;
  listBookings(tenantId: string, start: Date, end: Date): Promise<AvailabilityBooking[]>;
}

export class AgentToolForbiddenError extends Error {
  readonly status = 403;

  constructor() {
    super("Agent tools may only access the active tenant.");
    this.name = "AgentToolForbiddenError";
  }
}

export class AgentServiceNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("The requested service was not found.");
    this.name = "AgentServiceNotFoundError";
  }
}

const repository: AvailabilityToolRepository = {
  async findService(tenantId, serviceId) {
    return prisma.service.findFirst({
      where: { id: serviceId, tenantId, active: true },
      select: { id: true, durationMinutes: true },
    });
  },
  async listBusinessHours(tenantId) {
    return prisma.businessHour.findMany({
      where: { tenantId },
      select: { dayOfWeek: true, opensAt: true, closesAt: true, isClosed: true },
    });
  },
  async listBookings(tenantId, start, end) {
    return prisma.booking.findMany({
      where: {
        tenantId,
        startsAt: { lt: end },
        endsAt: { gt: start },
        status: { not: "cancelled" },
      },
      select: { startsAt: true, endsAt: true },
    });
  },
};

export interface AvailabilityToolResult {
  serviceId: string;
  slots: string[];
}

/** Build a tenant-bound availability lookup tool for the booking agent. */
export function createAvailabilityTool(
  availabilityRepository: AvailabilityToolRepository = repository,
  now: () => Date = () => new Date()
): AgentTool<AvailabilityToolInput, AvailabilityToolResult> {
  return defineAgentTool({
    name: "lookup_availability",
    description: "Find the available start times for a service in a date range.",
    inputSchema: availabilityToolInputSchema,
    async execute(input: AvailabilityToolInput, context: AgentRuntimeContext) {
      if (input.tenantId && input.tenantId !== context.tenantId) {
        throw new AgentToolForbiddenError();
      }

      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const service = await availabilityRepository.findService(context.tenantId, input.serviceId);
      if (!service) throw new AgentServiceNotFoundError();

      const [hours, bookings] = await Promise.all([
        availabilityRepository.listBusinessHours(context.tenantId),
        availabilityRepository.listBookings(context.tenantId, start, end),
      ]);
      return {
        serviceId: service.id,
        slots: computeSlots({
          service,
          dateRange: { start, end },
          bookings,
          hours,
          now: now(),
        }).map((slot) => slot.toISOString()),
      };
    },
  });
}

export const availabilityTool = createAvailabilityTool();
