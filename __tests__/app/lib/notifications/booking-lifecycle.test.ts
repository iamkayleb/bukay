import { afterEach, describe, expect, it, vi } from "vitest";

import {
  emitBookingLifecycleNotification,
  lifecycleEventTypeForBookingUpdate,
} from "@/app/lib/notifications/booking-lifecycle";
import {
  __resetNotificationSubscribersForTests,
  onLifecycleEvent,
} from "@/app/lib/notifications/subscribers";

afterEach(() => {
  __resetNotificationSubscribersForTests();
});

describe("lifecycleEventTypeForBookingUpdate", () => {
  const starts = new Date("2026-09-22T10:00:00.000Z");
  const later = new Date("2026-09-22T11:00:00.000Z");

  it("prefers cancel over confirm and reschedule", () => {
    expect(
      lifecycleEventTypeForBookingUpdate({
        previousStatus: "confirmed",
        nextStatus: "cancelled",
        previousStartsAt: starts,
        nextStartsAt: later,
      })
    ).toBe("booking.cancelled");
  });

  it("detects confirm and reschedule transitions", () => {
    expect(
      lifecycleEventTypeForBookingUpdate({
        previousStatus: "pending",
        nextStatus: "confirmed",
        previousStartsAt: starts,
        nextStartsAt: starts,
      })
    ).toBe("booking.confirmed");

    expect(
      lifecycleEventTypeForBookingUpdate({
        previousStatus: "confirmed",
        nextStatus: "confirmed",
        previousStartsAt: starts,
        nextStartsAt: later,
      })
    ).toBe("booking.rescheduled");
  });

  it("returns null when nothing notifiable changed", () => {
    expect(
      lifecycleEventTypeForBookingUpdate({
        previousStatus: "confirmed",
        nextStatus: "confirmed",
        previousStartsAt: starts,
        nextStartsAt: starts,
      })
    ).toBeNull();
  });
});

describe("emitBookingLifecycleNotification", () => {
  it("loads related rows and emits a lifecycle event", async () => {
    const handler = vi.fn();
    onLifecycleEvent(handler);

    const db = {
      client: {
        findFirst: vi.fn(async () => ({ name: "Ada", phone: "+2348012345678" })),
      },
      service: {
        findFirst: vi.fn(async () => ({ name: "Haircut" })),
      },
      tenant: {
        findUnique: vi.fn(async () => ({ name: "Salon" })),
      },
    };

    const emitted = await emitBookingLifecycleNotification({
      type: "booking.confirmed",
      booking: {
        id: "booking-1",
        tenantId: "tenant-1",
        clientId: "client-1",
        serviceId: "service-1",
        startsAt: new Date("2026-09-22T10:00:00.000Z"),
      },
      db,
    });

    expect(emitted).toMatchObject({
      type: "booking.confirmed",
      bookingId: "booking-1",
      to: "+2348012345678",
      clientName: "Ada",
      serviceName: "Haircut",
      businessName: "Salon",
    });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(emitted);
  });

  it("skips emission when the client phone is missing", async () => {
    const handler = vi.fn();
    onLifecycleEvent(handler);

    const result = await emitBookingLifecycleNotification({
      type: "booking.cancelled",
      booking: {
        id: "booking-1",
        tenantId: "tenant-1",
        clientId: "client-1",
        serviceId: "service-1",
        startsAt: new Date("2026-09-22T10:00:00.000Z"),
      },
      db: {
        client: { findFirst: vi.fn(async () => ({ name: "Ada", phone: "  " })) },
        service: { findFirst: vi.fn(async () => ({ name: "Haircut" })) },
        tenant: { findUnique: vi.fn(async () => ({ name: "Salon" })) },
      },
    });

    expect(result).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });
});
