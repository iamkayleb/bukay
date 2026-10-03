import { onBookingConfirmed } from "../events";

export type BookingLifecycleEventType = "created" | "confirmed" | "cancelled" | "rescheduled";

export const BOOKING_LIFECYCLE_EVENT_TYPES: readonly BookingLifecycleEventType[] = [
  "created",
  "confirmed",
  "cancelled",
  "rescheduled",
];

export type BookingLifecycleEvent = {
  type: BookingLifecycleEventType;
  bookingId: string;
  tenantId: string;
  /** Recipient in E.164 format. */
  to: string;
  customerName: string;
  serviceName: string;
  businessName: string;
  startsAt: Date;
  /** Only set for `rescheduled`: the slot the booking moved away from. */
  previousStartsAt?: Date;
};

export type BookingLifecycleHandler = (event: BookingLifecycleEvent) => void | Promise<void>;

const handlers = new Map<BookingLifecycleEventType, Set<BookingLifecycleHandler>>();

/** Subscribes to one lifecycle event type. Returns an unsubscribe function. */
export function subscribe(
  type: BookingLifecycleEventType,
  handler: BookingLifecycleHandler
): () => void {
  let set = handlers.get(type);
  if (!set) {
    set = new Set();
    handlers.set(type, set);
  }
  set.add(handler);
  return () => {
    set?.delete(handler);
  };
}

/** Subscribes one handler to all four lifecycle event types. */
export function subscribeAll(handler: BookingLifecycleHandler): () => void {
  const unsubscribers = BOOKING_LIFECYCLE_EVENT_TYPES.map((type) => subscribe(type, handler));
  return () => unsubscribers.forEach((off) => off());
}

/**
 * Publishes a lifecycle event to its subscribers. Handler failures are isolated so one bad
 * subscriber cannot block the others or the caller's booking flow; they are returned as errors.
 */
export async function publishLifecycleEvent(event: BookingLifecycleEvent): Promise<unknown[]> {
  const errors: unknown[] = [];
  for (const handler of Array.from(handlers.get(event.type) ?? [])) {
    try {
      await handler(event);
    } catch (err) {
      errors.push(err);
    }
  }
  return errors;
}

/**
 * Bridges the existing in-process `booking.confirmed` domain event into the lifecycle bus.
 * The domain event carries no contact details, so `resolve` supplies the notification context.
 */
export function bridgeBookingConfirmed(
  resolve: (bookingId: string, tenantId: string) => Promise<Omit<BookingLifecycleEvent, "type">>
): () => void {
  return onBookingConfirmed((event) => {
    void resolve(event.bookingId, event.tenantId)
      .then((context) => publishLifecycleEvent({ ...context, type: "confirmed" }))
      .catch(() => undefined);
  });
}

export function __resetLifecycleSubscribersForTests(): void {
  handlers.clear();
}
