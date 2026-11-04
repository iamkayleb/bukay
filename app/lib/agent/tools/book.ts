import { prisma } from "@/app/db/prisma";
import { denyForeignTenant } from "@/app/lib/agent/guard";
import type { AgentTool, JsonObject, ToolContext, ToolResult } from "@/app/lib/agent/types";
import { InvalidPhoneNumberError, validateNigerianPhone } from "@/app/lib/phone";
import { bookingSlotLock } from "@/app/lib/slot-hold";
import { isUniqueConstraintError } from "@/app/api/services/_helpers";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const CREATE_BOOKING_TOOL_NAME = "create_booking";

/** Unpaid conversational holds expire after 15 minutes. */
export const AGENT_HOLD_TTL_MS = 15 * 60 * 1000;

const UNPAID_STATUS = "pending_payment";

type BookingRow = {
  id: string;
  tenantId: string;
  clientId: string;
  serviceId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  notes: string | null;
};

function readString(args: JsonObject, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function serializeBooking(booking: BookingRow) {
  return {
    id: booking.id,
    tenantId: booking.tenantId,
    clientId: booking.clientId,
    serviceId: booking.serviceId,
    startsAt: booking.startsAt.toISOString(),
    endsAt: booking.endsAt.toISOString(),
    status: booking.status,
    notes: booking.notes,
  };
}

/**
 * Drop unpaid holds whose 15-minute window has elapsed and cancel their bookings.
 * Returns how many holds were released.
 */
export async function releaseUnpaidHolds(tenantId: string, now: Date): Promise<number> {
  return runWithTenantContext({ tenantId }, async () => {
    const expired = await prisma.slotHold.findMany({
      where: {
        tenantId,
        expiresAt: { lte: now },
      },
    });

    let released = 0;
    for (const hold of expired) {
      if (hold.bookingId) {
        await prisma.booking.updateMany({
          where: {
            tenantId,
            id: hold.bookingId,
            status: UNPAID_STATUS,
          },
          data: { status: "cancelled", slotLock: null },
        });
      }

      const deleted = await prisma.slotHold.deleteMany({
        where: { tenantId, id: hold.id },
      });
      released += deleted.count;
    }

    return released;
  });
}

async function confirmBooking(args: JsonObject, context: ToolContext): Promise<ToolResult> {
  const bookingId = readString(args, "bookingId");
  if (!bookingId) {
    return {
      status: 422,
      ok: false,
      error: "booking_id_required",
      message: "bookingId is required to confirm a hold",
    };
  }

  return runWithTenantContext({ tenantId: context.tenantId }, async () => {
    const booking = await prisma.booking.findFirst({
      where: { tenantId: context.tenantId, id: bookingId },
    });

    if (!booking) {
      return {
        status: 404,
        ok: false,
        error: "booking_not_found",
        message: "Booking was not found for this tenant",
      };
    }

    if (booking.status === "confirmed") {
      return {
        status: 200,
        ok: true,
        data: { booking: serializeBooking(booking), confirmed: true },
      };
    }

    if (booking.status !== UNPAID_STATUS) {
      return {
        status: 409,
        ok: false,
        error: "booking_not_confirmable",
        message: "Only an unpaid hold can be confirmed",
      };
    }

    const hold = await prisma.slotHold.findFirst({
      where: { tenantId: context.tenantId, bookingId: booking.id },
    });

    if (!hold || hold.expiresAt.getTime() <= context.now.getTime()) {
      await releaseUnpaidHolds(context.tenantId, context.now);
      return {
        status: 409,
        ok: false,
        error: "hold_expired",
        message: "The unpaid hold expired after 15 minutes",
      };
    }

    await prisma.booking.updateMany({
      where: { tenantId: context.tenantId, id: booking.id, status: UNPAID_STATUS },
      data: { status: "confirmed" },
    });
    await prisma.slotHold.deleteMany({
      where: { tenantId: context.tenantId, id: hold.id },
    });

    const confirmed = await prisma.booking.findFirst({
      where: { tenantId: context.tenantId, id: booking.id },
    });

    return {
      status: 200,
      ok: true,
      data: {
        booking: serializeBooking(confirmed ?? { ...booking, status: "confirmed" }),
        confirmed: true,
      },
    };
  });
}

async function holdBooking(args: JsonObject, context: ToolContext): Promise<ToolResult> {
  const serviceId = readString(args, "serviceId");
  const startsAtRaw = readString(args, "startsAt");
  const customerName = readString(args, "customerName");
  const phoneRaw = readString(args, "phone");
  const notes = readString(args, "notes");

  if (!serviceId || !startsAtRaw || !customerName || !phoneRaw) {
    return {
      status: 422,
      ok: false,
      error: "invalid_input",
      message: "serviceId, startsAt, customerName, and phone are required",
    };
  }

  const startsAt = new Date(startsAtRaw);
  if (Number.isNaN(startsAt.getTime())) {
    return {
      status: 422,
      ok: false,
      error: "invalid_starts_at",
      message: "startsAt must be a valid ISO date",
    };
  }

  let phone: string;
  try {
    phone = validateNigerianPhone(phoneRaw);
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return { status: 422, ok: false, error: "invalid_phone", message: error.message };
    }
    throw error;
  }

  return runWithTenantContext({ tenantId: context.tenantId }, async () => {
    await releaseUnpaidHolds(context.tenantId, context.now);

    const service = await prisma.service.findFirst({
      where: { tenantId: context.tenantId, id: serviceId, active: true },
    });
    if (!service) {
      return {
        status: 404,
        ok: false,
        error: "service_not_found",
        message: "Service was not found for this tenant",
      };
    }

    const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);
    const expiresAt = new Date(context.now.getTime() + AGENT_HOLD_TTL_MS);
    const slotLock = bookingSlotLock(service.id, startsAt);

    try {
      const result = await prisma.$transaction(async (tx) => {
        const foundHold = await tx.slotHold.findFirst({
          where: {
            tenantId: context.tenantId,
            serviceId: service.id,
            startsAt,
          },
        });

        if (
          foundHold &&
          foundHold.expiresAt.getTime() > context.now.getTime() &&
          foundHold.sessionId !== context.conversationId
        ) {
          return {
            conflict: "slot_held" as const,
            expiresAt: foundHold.expiresAt,
          };
        }

        let activeHold = foundHold;
        if (foundHold && foundHold.expiresAt.getTime() <= context.now.getTime()) {
          await tx.slotHold.deleteMany({
            where: { tenantId: context.tenantId, id: foundHold.id },
          });
          activeHold = null;
        }

        const overlapping = await tx.booking.findFirst({
          where: {
            tenantId: context.tenantId,
            serviceId: service.id,
            startsAt: { lt: endsAt },
            endsAt: { gt: startsAt },
            status: { not: "cancelled" },
          },
        });

        if (
          overlapping &&
          !(
            overlapping.status === UNPAID_STATUS &&
            overlapping.startsAt.getTime() === startsAt.getTime() &&
            activeHold?.sessionId === context.conversationId
          )
        ) {
          return { conflict: "slot_unavailable" as const, expiresAt: null };
        }

        let client = await tx.client.findFirst({
          where: { tenantId: context.tenantId, phone },
        });
        if (!client) {
          client = await tx.client.create({
            data: {
              tenantId: context.tenantId,
              name: customerName,
              phone,
            },
          });
        }

        const booking =
          overlapping ??
          (await tx.booking.create({
            data: {
              tenantId: context.tenantId,
              clientId: client.id,
              serviceId: service.id,
              startsAt,
              endsAt,
              status: UNPAID_STATUS,
              notes: notes || null,
              slotLock,
            },
          }));

        if (activeHold && activeHold.sessionId === context.conversationId) {
          await tx.slotHold.updateMany({
            where: { tenantId: context.tenantId, id: activeHold.id },
            data: { bookingId: booking.id, expiresAt },
          });
        } else {
          await tx.slotHold.create({
            data: {
              tenantId: context.tenantId,
              serviceId: service.id,
              startsAt,
              sessionId: context.conversationId,
              bookingId: booking.id,
              expiresAt,
            },
          });
        }

        return { booking, expiresAt };
      });

      if ("conflict" in result) {
        return {
          status: 409,
          ok: false,
          error: result.conflict,
          message:
            result.conflict === "slot_held"
              ? "This time slot is held by another session"
              : "This time slot is no longer available",
          data: result.expiresAt ? { holdExpiresAt: result.expiresAt.toISOString() } : undefined,
        };
      }

      return {
        status: 201,
        ok: true,
        data: {
          booking: serializeBooking(result.booking),
          holdExpiresAt: result.expiresAt.toISOString(),
          confirmed: false,
        },
      };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return {
          status: 409,
          ok: false,
          error: "slot_unavailable",
          message: "This time slot is no longer available",
        };
      }
      throw error;
    }
  });
}

export async function createBooking(args: JsonObject, context: ToolContext): Promise<ToolResult> {
  const denied = denyForeignTenant(args, context.tenantId);
  if (denied) {
    return denied;
  }

  if (args.confirm === true) {
    return confirmBooking(args, context);
  }

  return holdBooking(args, context);
}

export const createBookingTool: AgentTool = {
  name: CREATE_BOOKING_TOOL_NAME,
  description:
    "Hold a slot for 15 minutes as an unpaid booking. Call again with confirm=true and bookingId to confirm it.",
  parameters: {
    type: "object",
    properties: {
      serviceId: { type: "string" },
      startsAt: { type: "string", description: "Slot start, ISO-8601" },
      customerName: { type: "string" },
      phone: { type: "string" },
      notes: { type: "string" },
      confirm: { type: "boolean" },
      bookingId: { type: "string" },
    },
    required: ["serviceId", "startsAt", "customerName", "phone"],
  },
  execute: createBooking,
};
