import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config.js";

describe("next.config.js cache headers", () => {
  it("sets stale-while-revalidate for public slug routes", async () => {
    expect(typeof nextConfig.headers).toBe("function");
    const headersFn = nextConfig.headers!;
    const headers = await headersFn();
    const slugRule = headers.find((rule: { source: string }) => rule.source === "/:slug");
    expect(slugRule).toBeDefined();
    const cacheControl = slugRule!.headers.find(
      (header: { key: string }) => header.key === "Cache-Control"
    );
    expect(cacheControl?.value).toContain("stale-while-revalidate");
    expect(cacheControl?.value).toContain("s-maxage=");
  });
});
