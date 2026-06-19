import { describe, expect, it } from "vitest";
import {
  createServiceSchema,
  flattenFieldErrors,
  updateServiceSchema,
} from "@/app/lib/services/schemas";

describe("createServiceSchema", () => {
  it("accepts a valid payload and applies defaults", () => {
    const parsed = createServiceSchema.parse({
      name: "  Haircut  ",
      durationMinutes: 30,
      priceKobo: 500000,
    });
    expect(parsed).toEqual({
      name: "Haircut",
      durationMinutes: 30,
      priceKobo: 500000,
      bufferMinutes: 0,
      active: true,
    });
  });

  it("rejects empty name after trimming", () => {
    const result = createServiceSchema.safeParse({
      name: "   ",
      durationMinutes: 30,
      priceKobo: 100,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(flattenFieldErrors(result.error).name).toBeDefined();
    }
  });

  it("rejects non-integer or non-positive durations", () => {
    for (const durationMinutes of [0, -10, 1.5]) {
      const result = createServiceSchema.safeParse({
        name: "Test",
        durationMinutes,
        priceKobo: 1000,
      });
      expect(result.success).toBe(false);
    }
  });

  it("rejects fractional or negative prices", () => {
    for (const priceKobo of [-1, 9.99]) {
      const result = createServiceSchema.safeParse({
        name: "Test",
        durationMinutes: 30,
        priceKobo,
      });
      expect(result.success).toBe(false);
    }
  });

  it("allows priceKobo of zero", () => {
    const parsed = createServiceSchema.parse({
      name: "Free intro",
      durationMinutes: 15,
      priceKobo: 0,
    });
    expect(parsed.priceKobo).toBe(0);
  });

  it("rejects negative bufferMinutes", () => {
    const result = createServiceSchema.safeParse({
      name: "Test",
      durationMinutes: 30,
      priceKobo: 1000,
      bufferMinutes: -5,
    });
    expect(result.success).toBe(false);
  });
});

describe("updateServiceSchema", () => {
  it("allows partial updates", () => {
    const parsed = updateServiceSchema.parse({ active: false });
    expect(parsed).toEqual({ active: false });
  });

  it("still validates supplied fields", () => {
    const result = updateServiceSchema.safeParse({ durationMinutes: -1 });
    expect(result.success).toBe(false);
  });

  it("rejects empty payload", () => {
    const result = updateServiceSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("does not inject defaults on partial update", () => {
    const parsed = updateServiceSchema.parse({ priceKobo: 200 });
    expect(parsed).toEqual({ priceKobo: 200 });
  });
});

describe("flattenFieldErrors", () => {
  it("groups messages by field path", () => {
    const result = createServiceSchema.safeParse({
      name: "",
      durationMinutes: -1,
      priceKobo: -10,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const errors = flattenFieldErrors(result.error);
      expect(errors.name?.length).toBeGreaterThan(0);
      expect(errors.durationMinutes?.length).toBeGreaterThan(0);
      expect(errors.priceKobo?.length).toBeGreaterThan(0);
    }
  });
});
