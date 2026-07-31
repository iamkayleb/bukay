import { describe, expect, it } from "vitest";

import { manualBookingSchema } from "@/app/lib/bookings/schemas";

describe("manualBookingSchema", () => {
  it("accepts an existing-client payload", () => {
    const parsed = manualBookingSchema.safeParse({
      clientId: "client-1",
      serviceId: "svc-1",
      startsAt: "2026-07-15T10:00:00.000Z",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a new-client payload", () => {
    const parsed = manualBookingSchema.safeParse({
      newClient: { name: "Ada", phone: "+2348000000099" },
      serviceId: "svc-1",
      staffId: "staff-1",
      startsAt: "2026-07-15T10:00:00.000Z",
      notes: "Bring a book",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects payloads with both clientId and newClient", () => {
    const parsed = manualBookingSchema.safeParse({
      clientId: "c-1",
      newClient: { name: "Ada", phone: "+2348000000099" },
      serviceId: "svc-1",
      startsAt: "2026-07-15T10:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const messages = parsed.error.errors.map((e) => e.message);
      expect(messages).toContain("Provide exactly one of clientId or newClient");
    }
  });

  it("rejects payloads with neither clientId nor newClient", () => {
    const parsed = manualBookingSchema.safeParse({
      serviceId: "svc-1",
      startsAt: "2026-07-15T10:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid startsAt strings", () => {
    const parsed = manualBookingSchema.safeParse({
      clientId: "c-1",
      serviceId: "svc-1",
      startsAt: "not-a-date",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects newClient without name or phone", () => {
    const parsed = manualBookingSchema.safeParse({
      newClient: { name: "  ", phone: "" },
      serviceId: "svc-1",
      startsAt: "2026-07-15T10:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects invalid emails on new client", () => {
    const parsed = manualBookingSchema.safeParse({
      newClient: { name: "Ada", phone: "+2348000000099", email: "not-an-email" },
      serviceId: "svc-1",
      startsAt: "2026-07-15T10:00:00.000Z",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects notes over 1000 characters", () => {
    const parsed = manualBookingSchema.safeParse({
      clientId: "c-1",
      serviceId: "svc-1",
      startsAt: "2026-07-15T10:00:00.000Z",
      notes: "x".repeat(1001),
    });
    expect(parsed.success).toBe(false);
  });

  it("strips extra keys via strict()", () => {
    const parsed = manualBookingSchema.safeParse({
      clientId: "c-1",
      serviceId: "svc-1",
      startsAt: "2026-07-15T10:00:00.000Z",
      extraField: "nope",
    });
    expect(parsed.success).toBe(false);
  });
});
