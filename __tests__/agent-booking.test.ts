import { describe, expect, it } from "vitest";

import { AgentRuntime } from "@/app/lib/agent/runtime";
import {
  createAvailabilityTool,
  type AvailabilityToolRepository,
} from "@/app/lib/agent/tools/availability";
import { createBookTool, type BookingToolRepository } from "@/app/lib/agent/tools/book";

describe("booking agent scripted conversation", () => {
  it("finds an available time and reaches a confirmed booking", async () => {
    const availabilityRepository: AvailabilityToolRepository = {
      findService: async () => ({ id: "service-1", durationMinutes: 30 }),
      listBusinessHours: async () => [
        { dayOfWeek: 1, opensAt: "09:00", closesAt: "10:00", isClosed: false },
      ],
      listBookings: async () => [],
    };
    const bookingRepository: BookingToolRepository = {
      findService: async () => ({ id: "service-1", durationMinutes: 30 }),
      createBooking: async (input) => {
        expect(input.tenantId).toBe("tenant-1");
        expect(input.customerPhone).toBe("+2348031234567");
        return { id: "booking-1", status: "confirmed" };
      },
    };
    const runtime = new AgentRuntime([
      createAvailabilityTool(availabilityRepository, () => new Date("2026-09-01T00:00:00.000Z")),
      createBookTool(bookingRepository),
    ]);
    const context = { tenantId: "tenant-1", sessionId: "chat-1" };

    const availability = await runtime.invoke<{ slots: string[] }>(
      "lookup_availability",
      {
        serviceId: "service-1",
        startDate: "2026-09-14T00:00:00.000Z",
        endDate: "2026-09-14T00:00:00.000Z",
      },
      context
    );
    const booking = await runtime.invoke<{ booking: { status: string; startsAt: string } }>(
      "create_booking",
      {
        serviceId: "service-1",
        startsAt: availability.slots[0],
        customerName: "Ada Okafor",
        customerPhone: "08031234567",
      },
      context
    );

    expect(booking).toEqual({
      booking: {
        id: "booking-1",
        status: "confirmed",
        startsAt: "2026-09-14T09:00:00.000Z",
        endsAt: "2026-09-14T09:30:00.000Z",
      },
    });
  });
});
