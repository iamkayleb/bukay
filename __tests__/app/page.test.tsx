import { describe, it, expect } from "vitest";
import Home from "@/app/page";

describe("Home page", () => {
  it("exports a React component", () => {
    expect(typeof Home).toBe("function");
  });
});
