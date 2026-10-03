import { describe, expect, it, vi } from "vitest";
import { DeadLetterRecord, createDispatcher } from "@/app/lib/notifications/dispatch";
import { backoffDelayMs, isRetryableError, withRetry } from "@/app/lib/notifications/retry";
import {
  BOOKING_LIFECYCLE_EVENT_TYPES,
  BookingLifecycleEvent,
} from "@/app/lib/notifications/subscribers";
import { FakeWhatsAppProvider, WhatsAppProviderError } from "@/app/lib/whatsapp";
import { MemorySmsProvider, SmsProviderError } from "@/app/lib/sms";

const event = (type: BookingLifecycleEvent["type"]): BookingLifecycleEvent => ({
  type,
  bookingId: "b1",
  tenantId: "t1",
  to: "+2348012345678",
  customerName: "Ada",
  serviceName: "Braids",
  businessName: "Salon",
  startsAt: new Date("2026-01-01T10:00:00Z"),
});

const retry = { sleep: async () => {}, maxAttempts: 3 };

describe("retry", () => {
  it("backs off exponentially and caps", () => {
    const random = () => 0.5; // no jitter
    expect(backoffDelayMs(1, { random })).toBe(500);
    expect(backoffDelayMs(2, { random })).toBe(1000);
    expect(backoffDelayMs(10, { random, maxDelayMs: 2000 })).toBe(2000);
  });

  it("classifies errors", () => {
    expect(isRetryableError(new Error("net"))).toBe(true);
    expect(isRetryableError({ status: 503 })).toBe(true);
    expect(isRetryableError({ status: 429 })).toBe(true);
    expect(isRetryableError({ status: 400 })).toBe(false);
  });

  it("retries then succeeds, sleeping between attempts", async () => {
    const sleep = vi.fn(async () => {});
    const fn = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue("ok");
    await expect(withRetry(fn, { sleep })).resolves.toBe("ok");
    expect(sleep).toHaveBeenCalledOnce();
  });

  it("does not retry permanent errors", async () => {
    const fn = vi.fn().mockRejectedValue({ status: 400 });
    await expect(withRetry(fn, { sleep: async () => {} })).rejects.toMatchObject({ attempts: 1 });
    expect(fn).toHaveBeenCalledOnce();
  });
});

describe("dispatcher", () => {
  it("dispatches all four lifecycle events over WhatsApp", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    const sms = new MemorySmsProvider();
    const dispatch = createDispatcher({ whatsapp, sms, deadLetter: vi.fn(), retry });
    for (const type of BOOKING_LIFECYCLE_EVENT_TYPES) {
      const r = await dispatch(event(type));
      expect(r).toMatchObject({ status: "sent", channel: "whatsapp", fellBack: false });
    }
    expect(whatsapp.outbox).toHaveLength(4);
    expect(sms.outbox).toHaveLength(0);
  });

  it("falls back to SMS when WhatsApp fails", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    const waSend = vi
      .spyOn(whatsapp, "sendTemplate")
      .mockRejectedValue(new WhatsAppProviderError("fake", "down", { status: 503 }));
    const sms = new MemorySmsProvider();
    const dispatch = createDispatcher({ whatsapp, sms, deadLetter: vi.fn(), retry });
    const r = await dispatch(event("cancelled"));
    expect(r).toMatchObject({ status: "sent", channel: "sms", fellBack: true });
    expect(waSend).toHaveBeenCalledTimes(3);
    expect(sms.outbox).toHaveLength(1);
    expect(sms.outbox[0].body).toContain("cancelled");
  });

  it("dead-letters when both channels fail", async () => {
    const whatsapp = new FakeWhatsAppProvider();
    vi.spyOn(whatsapp, "sendTemplate").mockRejectedValue(
      new WhatsAppProviderError("fake", "wa down", { status: 503 })
    );
    const sms = new MemorySmsProvider();
    vi.spyOn(sms, "send").mockRejectedValue(
      new SmsProviderError("mem", "sms bad", { status: 400 })
    );
    const deadLetter = vi.fn(async (_record: DeadLetterRecord) => {});
    const dispatch = createDispatcher({ whatsapp, sms, deadLetter, retry });
    const r = await dispatch(event("rescheduled"));
    expect(r.status).toBe("dead-lettered");
    expect(deadLetter).toHaveBeenCalledOnce();
    expect(deadLetter.mock.calls[0][0]).toMatchObject({
      tenantId: "t1",
      bookingId: "b1",
      eventType: "rescheduled",
      attempts: 4,
    });
    expect(deadLetter.mock.calls[0][0].reason).toContain("wa down");
  });
});
