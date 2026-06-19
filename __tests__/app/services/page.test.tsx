import { describe, expect, it } from "vitest";
import ServicesPage from "@/app/services/page";

describe("/services page", () => {
  it("exports a React component", () => {
    expect(typeof ServicesPage).toBe("function");
  });
});
