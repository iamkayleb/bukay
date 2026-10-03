import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BOOKING_LIFECYCLE_EVENT_TYPES,
  BookingLifecycleEvent,
  __resetLifecycleSubscribersForTests,
  publishLifecycleEvent,
  subscribe,
  subscribeAll,
} from "@/app/lib/notifications/subscribers";

const base = {
  bookingId: "b1",
  tenantId: "t1",
  to: "+2348012345678",
  customerName: "Ada",
  serviceName: "Braids",
  businessName: "Salon",
  startsAt: new Date("2026-01-01T10:00:00Z"),
};

afterEach(() => __resetLifecycleSubscribersForTests());

describe("lifecycle subscribers", () => {
  it("delivers each of the four event types to subscribeAll", async () => {
    const seen: string[] = [];
    subscribeAll((e) => {
      seen.push(e.type);
    });
    for (const type of BOOKING_LIFECYCLE_EVENT_TYPES) {
      await publishLifecycleEvent({ ...base, type } as BookingLifecycleEvent);
    }
    expect(seen).toEqual(["created", "confirmed", "cancelled", "rescheduled"]);
  });

  it("only notifies subscribers of the matching type and supports unsubscribe", async () => {
    const handler = vi.fn();
    const off = subscribe("cancelled", handler);
    await publishLifecycleEvent({ ...base, type: "created" });
    expect(handler).not.toHaveBeenCalled();
    off();
    await publishLifecycleEvent({ ...base, type: "cancelled" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("isolates handler failures", async () => {
    const ok = vi.fn();
    subscribe("created", () => {
      throw new Error("boom");
    });
    subscribe("created", ok);
    const errors = await publishLifecycleEvent({ ...base, type: "created" });
    expect(errors).toHaveLength(1);
    expect(ok).toHaveBeenCalledOnce();
  });
});
