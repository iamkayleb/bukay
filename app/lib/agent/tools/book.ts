import { z } from "zod";

import { prisma } from "@/app/db/prisma";
import { normalizeNigerianPhone } from "@/app/lib/phone";
import { defineAgentTool, type AgentRuntimeContext, type AgentTool } from "@/app/lib/agent/runtime";
import {
  AgentServiceNotFoundError,
  AgentToolForbiddenError,
} from "@/app/lib/agent/tools/availability";

export const bookToolInputSchema = z
  .object({
    serviceId: z.string().trim().min(1),
    startsAt: z.string().datetime(),
    customerName: z.string().trim().min(1),
    customerPhone: z.string().trim().min(1),
    tenantId: z.string().trim().min(1).optional(),
  })
  .strict();

export type BookToolInput = z.infer<typeof bookToolInputSchema>;

export interface BookingToolService {
  id: string;
  durationMinutes: number;
}

export interface BookingToolRepository {
  findService(tenantId: string, serviceId: string): Promise<BookingToolService | null>;
  createBooking(input: {
    tenantId: string;
    serviceId: string;
    startsAt: Date;
    endsAt: Date;
    customerName: string;
    customerPhone: string;
  }): Promise<{ id: string; status: string }>;
}

export class AgentSlotUnavailableError extends Error {
  readonly status = 409;

  constructor() {
    super("That time is no longer available.");
    this.name = "AgentSlotUnavailableError";
  }
}

const repository: BookingToolRepository = {
  async findService(tenantId, serviceId) {
    return prisma.service.findFirst({
      where: { id: serviceId, tenantId, active: true },
      select: { id: true, durationMinutes: true },
    });
  },
  async createBooking(input) {
    return prisma.$transaction(async (transaction) => {
      const conflict = await transaction.booking.findFirst({
        where: {
          tenantId: input.tenantId,
          startsAt: { lt: input.endsAt },
          endsAt: { gt: input.startsAt },
          status: { not: "cancelled" },
        },
        select: { id: true },
      });
      if (conflict) throw new AgentSlotUnavailableError();

      const existingClient = await transaction.client.findFirst({
        where: { tenantId: input.tenantId, phone: input.customerPhone },
        select: { id: true },
      });
      const client = existingClient
        ? await transaction.client.update({
            // Include the tenant even though the id is globally unique. This
            // is required by the tenant guard and documents the ownership
            // check at the write boundary.
            where: { id: existingClient.id, tenantId: input.tenantId },
            data: { name: input.customerName },
            select: { id: true },
          })
        : await transaction.client.create({
            data: {
              tenantId: input.tenantId,
              name: input.customerName,
              phone: input.customerPhone,
            },
            select: { id: true },
          });
      return transaction.booking.create({
        data: {
          tenantId: input.tenantId,
          clientId: client.id,
          serviceId: input.serviceId,
          startsAt: input.startsAt,
          endsAt: input.endsAt,
          status: "confirmed",
        },
        select: { id: true, status: true },
      });
    });
  },
};

export interface BookToolResult {
  booking: {
    id: string;
    status: string;
    startsAt: string;
    endsAt: string;
  };
}

/** Create a confirmed booking after the agent has presented an available slot. */
export function createBookTool(
  bookingRepository: BookingToolRepository = repository
): AgentTool<BookToolInput, BookToolResult> {
  return defineAgentTool({
    name: "create_booking",
    description: "Create a confirmed booking for a selected available time.",
    inputSchema: bookToolInputSchema,
    async execute(input: BookToolInput, context: AgentRuntimeContext) {
      if (input.tenantId && input.tenantId !== context.tenantId) {
        throw new AgentToolForbiddenError();
      }

      let customerPhone: string;
      try {
        customerPhone = normalizeNigerianPhone(input.customerPhone);
      } catch {
        throw new Error("A valid Nigerian phone number is required to create a booking.");
      }

      const service = await bookingRepository.findService(context.tenantId, input.serviceId);
      if (!service) throw new AgentServiceNotFoundError();

      const startsAt = new Date(input.startsAt);
      const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
      const booking = await bookingRepository.createBooking({
        tenantId: context.tenantId,
        serviceId: service.id,
        startsAt,
        endsAt,
        customerName: input.customerName,
        customerPhone,
      });
      return {
        booking: {
          ...booking,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        },
      };
    },
  });
}

export const bookTool = createBookTool();
