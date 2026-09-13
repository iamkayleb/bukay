import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetDomainEventsForTests,
  emitBookingConfirmed,
  onBookingConfirmed,
  type BookingConfirmedEvent,
} from "@/app/lib/events";

afterEach(() => {
  __resetDomainEventsForTests();
});

function event(overrides: Partial<BookingConfirmedEvent> = {}): BookingConfirmedEvent {
  return {
    bookingId: "booking-1",
    tenantId: "tenant-1",
    staffId: "staff-1",
    startsAt: new Date("2026-07-27T10:00:00.000Z"),
    endsAt: new Date("2026-07-27T11:00:00.000Z"),
    ...overrides,
  };
}

describe("booking.confirmed domain event", () => {
  it("delivers the event payload to subscribers", () => {
    const handler = vi.fn();
    onBookingConfirmed(handler);

    const payload = event();
    emitBookingConfirmed(payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("notifies multiple subscribers", () => {
    const first = vi.fn();
    const second = vi.fn();
    onBookingConfirmed(first);
    onBookingConfirmed(second);

    emitBookingConfirmed(event());

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("stops delivering events once unsubscribed", () => {
    const handler = vi.fn();
    const unsubscribe = onBookingConfirmed(handler);

    unsubscribe();
    emitBookingConfirmed(event());

    expect(handler).not.toHaveBeenCalled();
  });

  it("does not notify subscribers if no booking is confirmed", () => {
    const handler = vi.fn();
    onBookingConfirmed(handler);

    expect(handler).not.toHaveBeenCalled();
  });
});
