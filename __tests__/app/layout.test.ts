import { describe, it, expect } from "vitest";
import { metadata, viewport } from "@/app/layout";

describe("root layout — metadata & viewport", () => {
  it("exports the expected app metadata", () => {
    expect(metadata.title).toBe("Bukay");
    expect(metadata.description).toBe("Bukay app");
  });

  it("declares a mobile-friendly viewport (required for Lighthouse mobile audit)", () => {
    expect(viewport.width).toBe("device-width");
    expect(viewport.initialScale).toBe(1);
  });

  it("declares a theme color for mobile browser UI", () => {
    expect(viewport.themeColor).toBeTruthy();
  });
});
