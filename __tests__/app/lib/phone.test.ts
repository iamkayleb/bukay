import { describe, expect, it } from "vitest";

import {
  InvalidPhoneNumberError,
  normalizeNigerianPhone,
  tryNormalizeNigerianPhone,
} from "@/app/lib/phone";

describe("public phone helpers", () => {
  it.each([
    ["08031234567", "+2348031234567"],
    ["+234 (803) 123-4567", "+2348031234567"],
    ["002348031234567", "+2348031234567"],
  ])("normalizes %s to E.164", (input, expected) => {
    expect(normalizeNigerianPhone(input)).toBe(expected);
  });

  it("rejects malformed numbers and exposes a non-throwing alternative", () => {
    expect(() => normalizeNigerianPhone("+1234567890")).toThrow(InvalidPhoneNumberError);
    expect(tryNormalizeNigerianPhone("08012345")).toBeNull();
  });
});
