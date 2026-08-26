import { describe, it, expect, afterEach, vi } from "vitest";
import {
  setEmailProviderForTests,
  __resetEmailProviderForTests,
  type EmailMessage,
  type EmailProvider,
  type EmailSendResult,
} from "@/app/lib/email";
import { sendBookingNotification } from "@/app/lib/email/send-booking-notification";
import type { BookingEmailContext } from "@/app/lib/email/templates";

function baseContext(overrides: Partial<BookingEmailContext> = {}): BookingEmailContext {
  return {
    tenantName: "Acme Salon",
    timezone: "Africa/Lagos",
    serviceName: "Haircut",
    staffName: "Alice",
    clientName: "Jordan",
    clientEmail: "jordan@example.com",
    startsAt: new Date("2026-08-15T14:30:00.000Z"),
    ...overrides,
  };
}

function fakeAuditLog() {
  const rows: Array<{ data: Record<string, unknown> }> = [];
  return {
    rows,
    create: vi.fn(async (args: { data: Record<string, unknown> }) => {
      rows.push(args);
      return args;
    }),
  };
}

afterEach(() => {
  __resetEmailProviderForTests();
});

describe("sendBookingNotification", () => {
  it("sends the confirmation and records exactly one AuditLog row with outcome and templateId", async () => {
    const sent: EmailMessage[] = [];
    const provider: EmailProvider = {
      name: "fake",
      async send(message: EmailMessage): Promise<EmailSendResult> {
        sent.push(message);
        return { id: "fake-1", provider: "fake", to: message.to };
      },
    };
    setEmailProviderForTests(provider);
    const auditLog = fakeAuditLog();

    const result = await sendBookingNotification({
      kind: "confirmed",
      tenantId: "tenant-1",
      actorId: "user-1",
      bookingId: "booking-1",
      context: baseContext(),
      auditLog,
    });

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("jordan@example.com");
    expect(result).toEqual({ outcome: "sent", templateId: "booking-confirmed-v1" });

    expect(auditLog.create).toHaveBeenCalledTimes(1);
    const metadata = JSON.parse(auditLog.rows[0].data.metadata as string);
    expect(auditLog.rows[0].data).toMatchObject({
      tenantId: "tenant-1",
      actorId: "user-1",
      action: "booking_email_send_attempted",
      entityType: "Booking",
      entityId: "booking-1",
    });
    expect(metadata).toMatchObject({
      kind: "confirmed",
      templateId: "booking-confirmed-v1",
      outcome: "sent",
    });
  });

  it("skips the send and still audits when the client has no email on file", async () => {
    const sent: EmailMessage[] = [];
    setEmailProviderForTests({
      name: "fake",
      async send(message: EmailMessage): Promise<EmailSendResult> {
        sent.push(message);
        return { id: "fake-1", provider: "fake", to: message.to };
      },
    });
    const auditLog = fakeAuditLog();

    const result = await sendBookingNotification({
      kind: "rescheduled",
      tenantId: "tenant-1",
      actorId: null,
      bookingId: "booking-1",
      context: baseContext({ clientEmail: null }),
      auditLog,
    });

    expect(sent).toHaveLength(0);
    expect(result.outcome).toBe("skipped");
    expect(auditLog.create).toHaveBeenCalledTimes(1);
    const metadata = JSON.parse(auditLog.rows[0].data.metadata as string);
    expect(metadata.outcome).toBe("skipped");
    expect(metadata.templateId).toBe("booking-rescheduled-v1");
  });

  it("records a failed outcome when the provider throws, without throwing itself", async () => {
    setEmailProviderForTests({
      name: "fake",
      async send(): Promise<EmailSendResult> {
        throw new Error("provider unavailable");
      },
    });
    const auditLog = fakeAuditLog();

    const result = await sendBookingNotification({
      kind: "cancelled",
      tenantId: "tenant-1",
      actorId: null,
      bookingId: "booking-1",
      context: baseContext(),
      auditLog,
    });

    expect(result.outcome).toBe("failed");
    expect(auditLog.create).toHaveBeenCalledTimes(1);
    const metadata = JSON.parse(auditLog.rows[0].data.metadata as string);
    expect(metadata.outcome).toBe("failed");
    expect(metadata.error).toBe("provider unavailable");
    expect(metadata.templateId).toBe("booking-cancelled-v1");
  });
});
