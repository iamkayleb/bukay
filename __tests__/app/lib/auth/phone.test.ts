import { describe, it, expect } from "vitest";
import {
  InvalidPhoneNumberError,
  normalizeNigerianPhone,
  tryNormalizeNigerianPhone,
} from "@/app/lib/auth/phone";

describe("normalizeNigerianPhone", () => {
  it("normalizes a local 0-prefixed mobile number to E.164", () => {
    expect(normalizeNigerianPhone("08031234567")).toBe("+2348031234567");
  });

  it("accepts numbers already in +234 form", () => {
    expect(normalizeNigerianPhone("+2348031234567")).toBe("+2348031234567");
  });

  it("accepts numbers with 234 prefix without +", () => {
    expect(normalizeNigerianPhone("2348031234567")).toBe("+2348031234567");
  });

  it("accepts numbers with 00234 international prefix", () => {
    expect(normalizeNigerianPhone("002348031234567")).toBe("+2348031234567");
  });

  it("strips spaces, dashes, dots and parentheses", () => {
    expect(normalizeNigerianPhone("0803-123 4567")).toBe("+2348031234567");
    expect(normalizeNigerianPhone("+234 (803) 123.4567")).toBe("+2348031234567");
  });

  it.each([
    ["", "empty"],
    ["abc", "letters"],
    ["08012345", "too short"],
    ["080123456789", "too long"],
    ["01012345678", "wrong leading digit"],
    ["+1234567890", "non-Nigerian country code"],
  ])("rejects %s (%s)", (input) => {
    expect(() => normalizeNigerianPhone(input)).toThrow(InvalidPhoneNumberError);
  });

  it("tryNormalizeNigerianPhone returns null for invalid input", () => {
    expect(tryNormalizeNigerianPhone("not-a-phone")).toBeNull();
    expect(tryNormalizeNigerianPhone("08031234567")).toBe("+2348031234567");
  });
});
