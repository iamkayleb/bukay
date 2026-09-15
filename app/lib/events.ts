import { EventEmitter } from "node:events";

export type BookingConfirmedEvent = {
  bookingId: string;
  tenantId: string;
  staffId: string | null;
  startsAt: Date;
  endsAt: Date;
};

const BOOKING_CONFIRMED = "booking.confirmed";

const emitter = new EventEmitter();

export function emitBookingConfirmed(event: BookingConfirmedEvent): void {
  emitter.emit(BOOKING_CONFIRMED, event);
}

export function onBookingConfirmed(handler: (event: BookingConfirmedEvent) => void): () => void {
  emitter.on(BOOKING_CONFIRMED, handler);
  return () => emitter.off(BOOKING_CONFIRMED, handler);
}

export function __resetDomainEventsForTests(): void {
  emitter.removeAllListeners();
}
