import { EventEmitter } from "node:events";

import { dispatchLifecycleNotification, type DispatchDeps, type DispatchResult } from "./dispatch";
import {
  LIFECYCLE_EVENT_TYPES,
  type LifecycleEventType,
  type LifecycleNotificationEvent,
} from "./types";

const LIFECYCLE = "lifecycle.notification";

const emitter = new EventEmitter();

export type LifecycleNotificationHandler = (
  event: LifecycleNotificationEvent
) => void | Promise<void>;

function assertLifecycleEvent(event: LifecycleNotificationEvent): void {
  if (!LIFECYCLE_EVENT_TYPES.includes(event.type as LifecycleEventType)) {
    throw new Error(`Unsupported lifecycle event type: ${String(event?.type)}`);
  }
  if (!event.bookingId?.trim()) throw new Error("Lifecycle event requires bookingId");
  if (!event.tenantId?.trim()) throw new Error("Lifecycle event requires tenantId");
  if (!event.to?.trim()) throw new Error("Lifecycle event requires recipient phone (to)");
}

/**
 * Publish a booking lifecycle notification event to local subscribers.
 */
export function emitLifecycleEvent(event: LifecycleNotificationEvent): void {
  assertLifecycleEvent(event);
  emitter.emit(LIFECYCLE, event);
}

/**
 * Subscribe to all booking lifecycle notification events.
 * Returns an unsubscribe function.
 */
export function onLifecycleEvent(handler: LifecycleNotificationHandler): () => void {
  const listener = (event: LifecycleNotificationEvent) => {
    void handler(event);
  };
  emitter.on(LIFECYCLE, listener);
  return () => emitter.off(LIFECYCLE, listener);
}

export type RegisterSubscribersOptions = DispatchDeps & {
  /**
   * Invoked after each dispatch settles (success or dead-letter).
   * Useful for tests and audit hooks.
   */
  onResult?: (event: LifecycleNotificationEvent, result: DispatchResult) => void;
};

/**
 * Wire lifecycle event subscribers to the WhatsApp/SMS dispatcher.
 * Returns an unsubscribe that removes every registered handler.
 */
export function registerNotificationSubscribers(options: RegisterSubscribersOptions): () => void {
  const { onResult, ...dispatchDeps } = options;

  return onLifecycleEvent(async (event) => {
    const result = await dispatchLifecycleNotification(event, dispatchDeps);
    onResult?.(event, result);
  });
}

/** Test helper: drop every lifecycle listener. */
export function __resetNotificationSubscribersForTests(): void {
  emitter.removeAllListeners(LIFECYCLE);
}

export { LIFECYCLE_EVENT_TYPES };
export type { LifecycleEventType, LifecycleNotificationEvent };
