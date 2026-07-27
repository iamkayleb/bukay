import { describe, it, expect } from "vitest";
import { normalizeIsoDate, isIsoDate } from "@/app/lib/schedule/iso-date";

describe("normalizeIsoDate", () => {
  it("passes through a well-formed YYYY-MM-DD string", () => {
    expect(normalizeIsoDate("2026-07-10")).toBe("2026-07-10");
  });

  it("extracts the date prefix from a full ISO timestamp", () => {
    expect(normalizeIsoDate("2026-07-10T12:34:56Z")).toBe("2026-07-10");
    expect(normalizeIsoDate("2026-12-31T23:59:59.999+00:00")).toBe("2026-12-31");
  });

  it("formats a Date as UTC calendar parts", () => {
    const date = new Date(Date.UTC(2026, 6, 10, 5, 30));
    expect(normalizeIsoDate(date)).toBe("2026-07-10");
  });

  it("rejects a value that is not YYYY-MM-DD", () => {
    expect(() => normalizeIsoDate("7/10/2026")).toThrow();
    expect(() => normalizeIsoDate("2026-7-10")).toThrow();
    expect(() => normalizeIsoDate("not a date")).toThrow();
    expect(() => normalizeIsoDate("")).toThrow();
    expect(() => normalizeIsoDate("2026-13-01")).toThrow();
    expect(() => normalizeIsoDate("2026-02-30")).toThrow();
  });

  it("rejects non-string, non-Date values", () => {
    expect(() => normalizeIsoDate(null)).toThrow();
    expect(() => normalizeIsoDate(undefined)).toThrow();
    expect(() => normalizeIsoDate(20260710)).toThrow();
    expect(() => normalizeIsoDate({})).toThrow();
  });

  it("rejects an invalid Date", () => {
    expect(() => normalizeIsoDate(new Date("nope"))).toThrow();
  });

  it("isIsoDate reflects validity", () => {
    expect(isIsoDate("2026-07-10")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });
});
