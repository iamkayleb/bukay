import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type LighthouseConfig = {
  ci: {
    collect: { url: string[] };
    assert: { assertions: Record<string, [string, { minScore: number }]> };
  };
};

describe("Lighthouse configuration", () => {
  it("enforces the shopfront SEO acceptance threshold", async () => {
    const config = JSON.parse(
      await readFile(resolve(process.cwd(), "lighthouserc.json"), "utf8")
    ) as LighthouseConfig;

    expect(config.ci.collect.url).toContain("http://localhost:3000/demo");
    expect(config.ci.assert.assertions["categories:seo"]).toEqual(["error", { minScore: 0.95 }]);
  });
});
