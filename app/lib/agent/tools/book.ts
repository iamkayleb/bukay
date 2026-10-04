import { getSlotHoldStore, type SlotHoldStore } from "@/app/lib/slot-hold";

import { ToolError, type AgentTool } from "../runtime";

/** Unpaid agent holds are released after 15 minutes. */
export const AGENT_HOLD_TTL_MS = 15 * 60 * 1000;

export type NewBooking = {
  tenantId: string;
  serviceId: string;
  startsAt: Date;
  customerName: string;
  customerPhone: string;
};

export type CreatedBooking = {
  id: string;
  status: "confirmed" | "pending_payment";
};

export interface BookDeps {
  createBooking(input: NewBooking): Promise<CreatedBooking>;
  holds?: SlotHoldStore;
}

export const BOOK_TOOL_NAME = "create_booking";

export function createBookTool(deps: BookDeps): AgentTool {
  return {
    name: BOOK_TOOL_NAME,
    description:
      "Book a slot. Holds it for 15 minutes until paid. Args: serviceId, startsAt (ISO), customerName, customerPhone.",
    async execute(args, ctx) {
      const { serviceId, startsAt, customerName, customerPhone } = args;
      if (
        typeof serviceId !== "string" ||
        typeof startsAt !== "string" ||
        typeof customerName !== "string" ||
        typeof customerPhone !== "string"
      ) {
        throw new ToolError(400, "serviceId, startsAt, customerName, customerPhone are required");
      }
      const start = new Date(startsAt);
      if (Number.isNaN(start.getTime())) throw new ToolError(400, `Invalid startsAt: ${startsAt}`);

      const holds = deps.holds ?? getSlotHoldStore();
      const key = { tenantId: ctx.tenantId, serviceId, staffId: null, startsAt: start };
      const hold = holds.acquire(key, AGENT_HOLD_TTL_MS);
      if (!hold.ok) throw new ToolError(409, "That slot is being held by someone else");

      let booking: CreatedBooking;
      try {
        booking = await deps.createBooking({
          tenantId: ctx.tenantId,
          serviceId,
          startsAt: start,
          customerName,
          customerPhone,
        });
      } catch (err) {
        holds.release(key, hold.holdId);
        throw err;
      }

      if (booking.status === "confirmed") {
        holds.release(key, hold.holdId);
        return { bookingId: booking.id, status: "confirmed" };
      }
      return {
        bookingId: booking.id,
        status: "pending_payment",
        holdId: hold.holdId,
        holdExpiresAt: new Date(hold.expiresAt).toISOString(),
      };
    },
  };
}
