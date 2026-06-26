import { describe, expect, it } from "vitest";

import { createServiceSchema, updateServiceSchema } from "@/app/lib/services/schemas";

describe("service schemas", () => {
  it("parses a valid create payload and applies create defaults", () => {
    const result = createServiceSchema.parse({
      name: "  Haircut  ",
      durationMinutes: "45",
      priceKobo: "750000",
    });

    expect(result).toEqual({
      name: "Haircut",
      durationMinutes: 45,
      priceKobo: 750000,
      bufferMinutes: 0,
      active: true,
    });
  });

  it("requires integer kobo prices", () => {
    const result = createServiceSchema.safeParse({
      name: "Braids",
      durationMinutes: 120,
      priceKobo: 1250.5,
      bufferMinutes: 15,
    });

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.flatten().fieldErrors.priceKobo).toContain(
      "Price must be a whole number"
    );
  });

  it("rejects invalid create field values inline by field", () => {
    const result = createServiceSchema.safeParse({
      name: " ",
      durationMinutes: 0,
      priceKobo: -1,
      bufferMinutes: -5,
      active: "yes",
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    const errors = result.error.flatten().fieldErrors;
    expect(errors.name).toContain("Name is required");
    expect(errors.durationMinutes).toContain("Duration must be at least 1 minute");
    expect(errors.priceKobo).toContain("Price cannot be negative");
    expect(errors.bufferMinutes).toContain("Buffer cannot be negative");
    expect(errors.active).toContain("Active must be true or false");
  });

  it("parses partial update payloads without applying create defaults", () => {
    const result = updateServiceSchema.parse({
      priceKobo: "900000",
      active: false,
    });

    expect(result).toEqual({
      priceKobo: 900000,
      active: false,
    });
  });

  it("rejects empty updates", () => {
    const result = updateServiceSchema.safeParse({});

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.flatten().fieldErrors._form).toContain(
      "At least one service field is required"
    );
  });

  it("rejects unknown fields", () => {
    const result = createServiceSchema.safeParse({
      name: "Massage",
      durationMinutes: 60,
      priceKobo: 500000,
      bufferMinutes: 10,
      active: true,
      tenantId: "tenant-from-client",
    });

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.flatten().formErrors).toContain(
      "Unrecognized key(s) in object: 'tenantId'"
    );
  });
});
