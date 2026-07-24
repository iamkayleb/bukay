import { describe, expect, it } from "vitest";

import {
  resolveWeekStart,
  startOfDay,
  startOfWeek,
} from "@/app/lib/calendar/week";

describe("startOfWeek", () => {
  // 2026-07-15 is a Wednesday. Handy anchor for testing.
  const wednesday = new Date("2026-07-15T12:34:56.000Z");

  it("defaults to Sunday when no weekStartsOn is provided", () => {
    const result = startOfWeek(new Date(wednesday));
    // Sunday before 2026-07-15 (Wed) is 2026-07-12 (locally).
    expect(result.getDay()).toBe(0);
    expect(result.getHours()).toBe(0);
    expect(result.getMinutes()).toBe(0);
  });

  it("respects a Monday start", () => {
    const result = startOfWeek(new Date(wednesday), 1);
    expect(result.getDay()).toBe(1);
  });

  it("respects a Saturday start", () => {
    const result = startOfWeek(new Date(wednesday), 6);
    expect(result.getDay()).toBe(6);
  });

  it("returns the same day when the anchor already sits on the start-of-week", () => {
    // Local Sunday: build the local midnight of a known Sunday.
    const localSunday = startOfDay(startOfWeek(new Date(wednesday), 0));
    const result = startOfWeek(localSunday, 0);
    expect(result.getTime()).toBe(localSunday.getTime());
  });

  it("does not mutate the input date", () => {
    const source = new Date(wednesday);
    const stamp = source.getTime();
    startOfWeek(source, 1);
    expect(source.getTime()).toBe(stamp);
  });
});

describe("resolveWeekStart", () => {
  it("returns 0 (Sunday) for en-US", () => {
    expect(resolveWeekStart("en-US")).toBe(0);
  });

  it("returns 1 (Monday) for en-GB", () => {
    expect(resolveWeekStart("en-GB")).toBe(1);
  });

  it("returns 1 (Monday) for a bare 'de' primary tag", () => {
    expect(resolveWeekStart("de")).toBe(1);
  });

  it("returns 6 (Saturday) for ar-EG", () => {
    expect(resolveWeekStart("ar-EG")).toBe(6);
  });

  it("falls back to Sunday when the locale is undefined or empty", () => {
    expect(resolveWeekStart(undefined)).toBe(0);
    expect(resolveWeekStart(null)).toBe(0);
    expect(resolveWeekStart("")).toBe(0);
    expect(resolveWeekStart("   ")).toBe(0);
  });

  it("falls back to primary subtag for unknown regional variants", () => {
    // de-BE is not explicitly listed, but 'de' is Monday-first.
    expect(resolveWeekStart("de-BE")).toBe(1);
  });
});
