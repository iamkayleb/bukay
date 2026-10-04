import { computeSlots, type BusinessHours, type ExistingBooking } from "@/app/lib/availability";

import { ToolError, type AgentTool } from "../runtime";

export type ServiceSchedule = {
  businessHours: BusinessHours[];
  durationMinutes: number;
  bufferMinutes?: number;
  existingBookings?: ExistingBooking[];
};

export interface AvailabilityDeps {
  /** Must scope the lookup to `tenantId`; returns null when the service is not the tenant's. */
  loadSchedule(tenantId: string, serviceId: string): Promise<ServiceSchedule | null>;
  now?: () => Date;
}

export const AVAILABILITY_TOOL_NAME = "check_availability";

export function createAvailabilityTool(deps: AvailabilityDeps): AgentTool {
  return {
    name: AVAILABILITY_TOOL_NAME,
    description:
      "List open booking slots for a service on a date. Args: serviceId (string), date (ISO date, e.g. 2026-08-03).",
    async execute(args, ctx) {
      const { serviceId, date } = args;
      if (typeof serviceId !== "string" || typeof date !== "string") {
        throw new ToolError(400, "serviceId and date are required strings");
      }
      const day = new Date(date);
      if (Number.isNaN(day.getTime())) throw new ToolError(400, `Invalid date: ${date}`);

      const schedule = await deps.loadSchedule(ctx.tenantId, serviceId);
      if (!schedule) throw new ToolError(404, `Unknown service: ${serviceId}`);

      const slots = computeSlots({ ...schedule, date: day, now: deps.now?.() });
      return { serviceId, slots: slots.map((s) => s.start.toISOString()) };
    },
  };
}
