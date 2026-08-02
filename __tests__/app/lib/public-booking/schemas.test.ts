import { describe, expect, it } from "vitest";

import { bookingClientDetailsSchema } from "@/app/lib/public-booking/schemas";

describe("bookingClientDetailsSchema", () => {
  it("trims client names and normalizes Nigerian phone numbers", () => {
    const result = bookingClientDetailsSchema.parse({
      name: "  Ada Okafor  ",
      phone: "0803 123 4567",
    });

    expect(result).toEqual({
      name: "Ada Okafor",
      phone: "+2348031234567",
    });
  });

  it.each(["08031234567", "+2348031234567", "2348031234567", "002348031234567"])(
    "accepts %s as a Nigerian phone number",
    (phone) => {
      expect(
        bookingClientDetailsSchema.parse({
          name: "Ada Okafor",
          phone,
        }).phone
      ).toBe("+2348031234567");
    }
  );

  it.each(["", "not-a-phone", "+12025550123", "01012345678", "08012345"])(
    "returns a phone field error for invalid input %s",
    (phone) => {
      const result = bookingClientDetailsSchema.safeParse({
        name: "Ada Okafor",
        phone,
      });

      expect(result.success).toBe(false);
      expect(result.success ? undefined : result.error.flatten().fieldErrors.phone).toContain(
        "Enter a valid Nigerian phone number"
      );
    }
  );

  it("rejects missing or empty names", () => {
    const result = bookingClientDetailsSchema.safeParse({
      name: " ",
      phone: "08031234567",
    });

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.flatten().fieldErrors.name).toContain(
      "Name is required"
    );
  });

  it("rejects unknown client-supplied fields", () => {
    const result = bookingClientDetailsSchema.safeParse({
      name: "Ada Okafor",
      phone: "08031234567",
      tenantId: "tenant-from-client",
    });

    expect(result.success).toBe(false);
    expect(result.success ? undefined : result.error.flatten().formErrors).toContain(
      "Unrecognized key(s) in object: 'tenantId'"
    );
  });
});
