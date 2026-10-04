import { prisma } from "@/app/db/prisma";
import { computeSlots, type BusinessHours, type ExistingBooking } from "@/app/lib/availability";
import { denyForeignTenant } from "@/app/lib/agent/guard";
import type { AgentTool, JsonObject, ToolContext, ToolResult } from "@/app/lib/agent/types";
import { releaseUnpaidHolds } from "@/app/lib/agent/tools/book";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

export const LOOKUP_AVAILABILITY_TOOL_NAME = "lookup_availability";

const DAY_MS = 24 * 60 * 60 * 1000;

function readString(args: JsonObject, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function parseRange(args: JsonObject): { from: Date; to: Date } | null {
  const fromRaw = readString(args, "from");
  const toRaw = readString(args, "to");
  if (fromRaw && toRaw) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || to <= from) {
      return null;
    }
    return { from, to };
  }

  const dateRaw = readString(args, "date");
  if (!dateRaw) {
    return null;
  }

  const date = new Date(`${dateRaw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return { from: date, to: new Date(date.getTime() + DAY_MS) };
}

export async function lookupAvailability(
  args: JsonObject,
  context: ToolContext
): Promise<ToolResult> {
  const denied = denyForeignTenant(args, context.tenantId);
  if (denied) {
    return denied;
  }

  const range = parseRange(args);
  if (!range) {
    return {
      status: 422,
      ok: false,
      error: "invalid_range",
      message: "Provide from and to ISO timestamps, or a UTC date (YYYY-MM-DD)",
    };
  }

  const serviceId = readString(args, "serviceId");
  const serviceName = readString(args, "serviceName");
  if (!serviceId && !serviceName) {
    return {
      status: 422,
      ok: false,
      error: "service_required",
      message: "serviceId or serviceName is required",
    };
  }

  return runWithTenantContext({ tenantId: context.tenantId }, async () => {
    await releaseUnpaidHolds(context.tenantId, context.now);

    const service = await prisma.service.findFirst({
      where: {
        tenantId: context.tenantId,
        active: true,
        ...(serviceId ? { id: serviceId } : { name: serviceName }),
      },
    });

    if (!service) {
      return {
        status: 404,
        ok: false,
        error: "service_not_found",
        message: "Service was not found for this tenant",
      };
    }

    const hours = await prisma.businessHour.findMany({
      where: { tenantId: context.tenantId },
    });
    const bookings = await prisma.booking.findMany({
      where: {
        tenantId: context.tenantId,
        serviceId: service.id,
        status: { not: "cancelled" },
        startsAt: { lt: range.to },
        endsAt: { gt: range.from },
      },
    });
    const holds = await prisma.slotHold.findMany({
      where: {
        tenantId: context.tenantId,
        serviceId: service.id,
        expiresAt: { gt: context.now },
        startsAt: { gte: range.from, lt: range.to },
      },
    });

    const occupied: ExistingBooking[] = [
      ...bookings.map((booking) => ({
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
      })),
      ...holds
        .filter((hold) => !bookings.some((booking) => booking.id === hold.bookingId))
        .map((hold) => ({
          startsAt: hold.startsAt,
          endsAt: new Date(hold.startsAt.getTime() + service.durationMinutes * 60_000),
        })),
    ];

    const businessHours: BusinessHours[] = hours.map((hour) => ({
      dayOfWeek: hour.dayOfWeek,
      opensAt: hour.opensAt,
      closesAt: hour.closesAt,
      isClosed: hour.isClosed,
    }));

    const slots = computeSlots(
      { durationMinutes: service.durationMinutes },
      { start: range.from, end: range.to },
      occupied,
      businessHours
    );

    return {
      status: 200,
      ok: true,
      data: {
        serviceId: service.id,
        serviceName: service.name,
        slots: slots.map((slot) => ({
          startsAt: slot.startsAt.toISOString(),
          endsAt: slot.endsAt.toISOString(),
        })),
      },
    };
  });
}

export const lookupAvailabilityTool: AgentTool = {
  name: LOOKUP_AVAILABILITY_TOOL_NAME,
  description: "List open appointment slots for a service in the current tenant.",
  parameters: {
    type: "object",
    properties: {
      serviceId: { type: "string" },
      serviceName: { type: "string" },
      from: { type: "string", description: "Range start, ISO-8601" },
      to: { type: "string", description: "Range end, ISO-8601" },
      date: { type: "string", description: "UTC day YYYY-MM-DD, used when from/to are omitted" },
    },
  },
  execute: lookupAvailability,
};
