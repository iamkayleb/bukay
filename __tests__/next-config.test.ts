import { createRequire } from "node:module";

import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const nextConfig = require("../next.config.js");

describe("next config headers", () => {
  it("sets CDN stale-while-revalidate caching for tenant landing pages", async () => {
    const headers = await nextConfig.headers();

    expect(headers).toContainEqual({
      source:
        "/:slug((?!(?:api|_next|login|today|calendar|clients|services|settings|favicon\\.ico)$)[^/]+)",
      headers: [
        {
          key: "Cache-Control",
          value: "public, s-maxage=300, stale-while-revalidate=3600",
        },
      ],
    });
  });
});
