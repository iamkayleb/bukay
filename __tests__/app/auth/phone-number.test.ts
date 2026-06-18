import { describe, expect, it } from "vitest";
import { normalizeNigerianPhoneNumber } from "@/app/auth/phone-number";

describe("normalizeNigerianPhoneNumber", () => {
  it.each([
    ["08012345678", "+2348012345678"],
    ["8012345678", "+2348012345678"],
    ["2348012345678", "+2348012345678"],
    ["+234 801 234 5678", "+2348012345678"],
  ])("normalizes %s to E.164", (input, expected) => {
    expect(normalizeNigerianPhoneNumber(input)).toBe(expected);
  });

  it("rejects non-Nigerian phone numbers", () => {
    expect(() => normalizeNigerianPhoneNumber("+14155552671")).toThrowError(
      "Enter a valid Nigerian phone number"
    );
  });
});
