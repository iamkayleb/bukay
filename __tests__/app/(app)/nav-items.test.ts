import { describe, expect, it } from "vitest";

import { NAV_ITEMS, isActivePath } from "@/app/(app)/components/nav-items";

describe("nav items", () => {
  it("exposes the canonical authenticated sections in order", () => {
    expect(NAV_ITEMS.map((item) => item.label)).toEqual([
      "Today",
      "Calendar",
      "Clients",
      "Services",
      "Settings",
    ]);
    expect(NAV_ITEMS.map((item) => item.href)).toEqual([
      "/today",
      "/calendar",
      "/clients",
      "/services",
      "/settings",
    ]);
  });
});

describe("isActivePath", () => {
  it("returns true when the path matches exactly", () => {
    expect(isActivePath("/today", "/today")).toBe(true);
  });

  it("returns true when the path is a child of the target", () => {
    expect(isActivePath("/services/123", "/services")).toBe(true);
  });

  it("returns false when the path is unrelated", () => {
    expect(isActivePath("/calendar", "/today")).toBe(false);
  });

  it("returns false when the path is empty", () => {
    expect(isActivePath("", "/today")).toBe(false);
  });

  it("does not treat sibling prefixes as active", () => {
    expect(isActivePath("/settings-admin", "/settings")).toBe(false);
  });
});
