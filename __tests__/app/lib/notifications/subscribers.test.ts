import { afterEach, describe, expect, it, vi } from "vitest";

import {
  __resetNotificationSubscribersForTests,
  emitLifecycleEvent,
  onLifecycleEvent,
  registerNotificationSubscribers,
  type LifecycleNotificationEvent,
} from "@/app/lib/notifications/subscribers";
import { LIFECYCLE_EVENT_TYPES } from "@/app/lib/notifications/types";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import { MemorySmsProvider } from "@/app/lib/sms/memory";
import type { SmsProvider } from "@/app/lib/sms/provider";
import type { NotificationDeadLetterDb } from "@/app/lib/notifications/dispatch";

afterEach(() => {
  __resetNotificationSubscribersForTests();
});

function event(
  type: LifecycleNotificationEvent["type"],
  overrides: Partial<LifecycleNotificationEvent> = {}
): LifecycleNotificationEvent {
  return {
    type,
    bookingId: "booking-1",
    tenantId: "tenant-1",
    to: "+2348012345678",
    clientName: "Ada Lovelace",
    serviceName: "Classic Haircut",
    businessName: "Bukay Demo Salon",
    startsAt: "2026-09-22T10:00:00.000Z",
    previousStartsAt: type === "booking.rescheduled" ? "2026-09-22T09:00:00.000Z" : undefined,
    ...overrides,
  };
}

function memoryDeadLetterDb(): NotificationDeadLetterDb & {
  rows: Array<Record<string, unknown>>;
} {
  const rows: Array<Record<string, unknown>> = [];
  return {
    rows,
    deadLetter: {
      async create({ data }) {
        rows.push({ ...data });
        return data;
      },
    },
  };
}

describe("lifecycle notification subscribers", () => {
  it("delivers emitted events to onLifecycleEvent handlers", async () => {
    const handler = vi.fn();
    onLifecycleEvent(handler);

    const payload = event("booking.created");
    emitLifecycleEvent(payload);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(payload);
  });

  it("registerNotificationSubscribers dispatches all four lifecycle events", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    const sms = new MemorySmsProvider();
    const db = memoryDeadLetterDb();
    const results: Array<{ type: string; channel: string }> = [];

    registerNotificationSubscribers({
      whatsapp,
      sms,
      db,
      backoff: { maxAttempts: 1, baseDelayMs: 0, sleep: async () => undefined },
      onResult: (evt, result) => {
        if (result.status === "sent") {
          results.push({ type: evt.type, channel: result.channel });
        }
      },
    });

    for (const type of LIFECYCLE_EVENT_TYPES) {
      emitLifecycleEvent(event(type));
      await vi.waitFor(() => {
        expect(results.some((r) => r.type === type)).toBe(true);
      });
    }

    expect(results.map((r) => r.type).sort()).toEqual([...LIFECYCLE_EVENT_TYPES].sort());
    expect(whatsapp.outbox).toHaveLength(4);
    expect(results.every((r) => r.channel === "whatsapp")).toBe(true);
  });

  it("rejects unsupported or incomplete lifecycle payloads", () => {
    expect(() =>
      emitLifecycleEvent({
        ...(event("booking.created") as LifecycleNotificationEvent),
        type: "booking.unknown" as LifecycleNotificationEvent["type"],
      })
    ).toThrow(/Unsupported lifecycle event type/);

    expect(() => emitLifecycleEvent(event("booking.created", { to: "" }))).toThrow(
      /recipient phone/
    );
  });
});

describe("registerNotificationSubscribers fallback wiring", () => {
  it("falls back to SMS when WhatsApp fails for a subscribed event", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    whatsapp.nextError = new Error("whatsapp down");
    const sms = new MemorySmsProvider();
    const db = memoryDeadLetterDb();
    const onResult = vi.fn();

    registerNotificationSubscribers({
      whatsapp,
      sms,
      db,
      backoff: { maxAttempts: 1, baseDelayMs: 0, sleep: async () => undefined },
      onResult,
    });

    emitLifecycleEvent(event("booking.confirmed"));

    await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
    const [, result] = onResult.mock.calls[0];
    expect(result).toMatchObject({ status: "sent", channel: "sms" });
    expect(sms.outbox).toHaveLength(1);
    expect(db.rows).toHaveLength(0);
  });
});

/** Failing SMS double used only in this suite. */
class FailingSmsProvider implements SmsProvider {
  readonly name = "failing-sms";
  async send(): Promise<never> {
    throw new Error("sms down");
  }
}

describe("registerNotificationSubscribers dead-letter wiring", () => {
  it("records DeadLetter when WhatsApp and SMS both fail", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    whatsapp.nextError = new Error("whatsapp down");
    const sms = new FailingSmsProvider();
    const db = memoryDeadLetterDb();
    const onResult = vi.fn();

    registerNotificationSubscribers({
      whatsapp,
      sms,
      db,
      backoff: { maxAttempts: 1, baseDelayMs: 0, sleep: async () => undefined },
      onResult,
    });

    emitLifecycleEvent(event("booking.cancelled"));

    await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
    expect(onResult.mock.calls[0][1]).toMatchObject({ status: "dead_lettered" });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      source: "notifications",
      eventType: "booking.cancelled",
      tenantId: "tenant-1",
    });
    const payload = JSON.parse(String(db.rows[0].payload));
    expect(payload.bookingId).toBe("booking-1");
    expect(payload.event.type).toBe("booking.cancelled");
  });
});
