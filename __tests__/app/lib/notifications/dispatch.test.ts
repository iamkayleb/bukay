import { describe, expect, it, vi } from "vitest";

import {
  bodyParametersForEvent,
  dispatchLifecycleNotification,
  renderSmsBody,
  type NotificationDeadLetterDb,
} from "@/app/lib/notifications/dispatch";
import type { LifecycleNotificationEvent } from "@/app/lib/notifications/types";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import { MemorySmsProvider } from "@/app/lib/sms/memory";
import type { SmsProvider } from "@/app/lib/sms/provider";

function event(
  type: LifecycleNotificationEvent["type"],
  overrides: Partial<LifecycleNotificationEvent> = {}
): LifecycleNotificationEvent {
  return {
    type,
    bookingId: "booking-1",
    tenantId: "tenant-1",
    to: "+2348012345678",
    clientName: "Ada",
    serviceName: "Cut",
    businessName: "Salon",
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

const noSleepBackoff = { maxAttempts: 2 as const, baseDelayMs: 0, sleep: async () => undefined };

describe("dispatchLifecycleNotification", () => {
  it("sends WhatsApp for each lifecycle event type", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    const sms = new MemorySmsProvider();
    const db = memoryDeadLetterDb();

    for (const type of [
      "booking.created",
      "booking.confirmed",
      "booking.cancelled",
      "booking.rescheduled",
    ] as const) {
      const result = await dispatchLifecycleNotification(event(type), {
        whatsapp,
        sms,
        db,
        backoff: noSleepBackoff,
      });
      expect(result).toMatchObject({ status: "sent", channel: "whatsapp" });
    }

    expect(whatsapp.outbox).toHaveLength(4);
    expect(
      whatsapp.outbox.map((m) => (m.content.kind === "template" ? m.content.name : ""))
    ).toEqual(["booking_created", "booking_confirmed", "booking_cancelled", "booking_rescheduled"]);
    expect(sms.outbox).toHaveLength(0);
  });

  it("falls back to SMS when WhatsApp fails", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    whatsapp.nextError = new Error("meta 500");
    const sms = new MemorySmsProvider();
    const db = memoryDeadLetterDb();

    const result = await dispatchLifecycleNotification(event("booking.created"), {
      whatsapp,
      sms,
      db,
      backoff: { maxAttempts: 1, baseDelayMs: 0, sleep: async () => undefined },
    });

    expect(result).toMatchObject({ status: "sent", channel: "sms", provider: "memory" });
    expect(sms.outbox).toHaveLength(1);
    expect(sms.outbox[0].body).toContain("Ada");
    expect(sms.outbox[0].body).toContain("Cut");
    expect(db.rows).toHaveLength(0);
  });

  it("writes DeadLetter when WhatsApp and SMS both fail permanently", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    whatsapp.nextError = new Error("wa fail");
    const sms: SmsProvider = {
      name: "broken",
      send: async () => {
        throw new Error("sms fail");
      },
    };
    const db = memoryDeadLetterDb();

    const result = await dispatchLifecycleNotification(event("booking.rescheduled"), {
      whatsapp,
      sms,
      db,
      backoff: { maxAttempts: 1, baseDelayMs: 0, sleep: async () => undefined },
    });

    expect(result.status).toBe("dead_lettered");
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({
      source: "notifications",
      eventType: "booking.rescheduled",
      tenantId: "tenant-1",
    });
    expect(String(db.rows[0].reason)).toMatch(/wa fail/);
    expect(String(db.rows[0].reason)).toMatch(/sms fail/);
  });

  it("retries WhatsApp with backoff before falling back", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    const send = vi.spyOn(whatsapp, "send");
    send.mockRejectedValueOnce(new Error("transient")).mockResolvedValueOnce({
      provider: "fake",
      id: "wamid.recovered",
      to: "+2348012345678",
      httpStatus: 200,
    });

    const sms = new MemorySmsProvider();
    const sleeps: number[] = [];

    const result = await dispatchLifecycleNotification(event("booking.confirmed"), {
      whatsapp,
      sms,
      db: memoryDeadLetterDb(),
      backoff: {
        maxAttempts: 2,
        baseDelayMs: 10,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    });

    expect(result).toMatchObject({ status: "sent", channel: "whatsapp", id: "wamid.recovered" });
    expect(send).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([10]);
    expect(sms.outbox).toHaveLength(0);
  });
});

describe("notification message rendering", () => {
  it("builds ordered WhatsApp body parameters including reschedule times", () => {
    expect(bodyParametersForEvent(event("booking.created"))).toEqual([
      "Ada",
      "Cut",
      "2026-09-22T10:00:00.000Z",
      "Salon",
    ]);
    expect(bodyParametersForEvent(event("booking.rescheduled"))).toEqual([
      "Ada",
      "Cut",
      "2026-09-22T09:00:00.000Z",
      "2026-09-22T10:00:00.000Z",
      "Salon",
    ]);
  });

  it("renders an SMS body from the WhatsApp template example", () => {
    const body = renderSmsBody(event("booking.cancelled"));
    expect(body).toBe(
      "Hi Ada, your Cut appointment on 2026-09-22T10:00:00.000Z at Salon has been cancelled."
    );
  });
});
