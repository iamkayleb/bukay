import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

type LhciConfig = {
  ci: {
    collect: {
      url: string[];
      numberOfRuns: number;
      startServerCommand: string;
      settings: {
        formFactor: string;
        screenEmulation: {
          mobile: boolean;
          width: number;
          height: number;
        };
        throttling: {
          rttMs: number;
          throughputKbps: number;
          cpuSlowdownMultiplier: number;
        };
      };
    };
    assert: {
      assertions: Record<string, [string, { minScore: number }]>;
    };
  };
};

function loadConfig(): LhciConfig {
  const path = resolve(__dirname, "..", "lighthouserc.json");
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as LhciConfig;
}

describe("lighthouserc.json — mobile audit configuration", () => {
  const config = loadConfig();

  it("targets every authenticated layout page in addition to public entry points", () => {
    const urls = config.ci.collect.url;
    const requiredPaths = ["/", "/login", "/today", "/calendar", "/clients", "/services", "/settings"];

    for (const path of requiredPaths) {
      const suffix = path === "/" ? "/" : path;
      expect(
        urls.some((u) => u.endsWith(suffix)),
        `expected LHCI to audit ${suffix} but only got ${urls.join(", ")}`
      ).toBe(true);
    }
  });

  it("emulates a mobile form factor at a real-device viewport", () => {
    const { formFactor, screenEmulation } = config.ci.collect.settings;
    expect(formFactor).toBe("mobile");
    expect(screenEmulation.mobile).toBe(true);
    expect(screenEmulation.width).toBeGreaterThan(0);
    expect(screenEmulation.height).toBeGreaterThan(0);
  });

  it("applies moderated 3G-style throttling so scores reflect a realistic mobile network", () => {
    const { throttling } = config.ci.collect.settings;
    expect(throttling.rttMs).toBeGreaterThanOrEqual(100);
    expect(throttling.throughputKbps).toBeGreaterThan(0);
    expect(throttling.cpuSlowdownMultiplier).toBeGreaterThanOrEqual(1);
  });

  it("runs multiple lighthouse passes so a single-run outlier cannot pass the gate", () => {
    expect(config.ci.collect.numberOfRuns).toBeGreaterThanOrEqual(3);
  });

  it("asserts performance and accessibility at ≥0.9 as errors (the mobile ≥90 acceptance criterion)", () => {
    const { assertions } = config.ci.assert;

    const perf = assertions["categories:performance"];
    expect(perf, "performance assertion must be configured").toBeDefined();
    expect(perf[0], "performance must fail the build on regression").toBe("error");
    expect(perf[1].minScore).toBeGreaterThanOrEqual(0.9);

    const a11y = assertions["categories:accessibility"];
    expect(a11y, "accessibility assertion must be configured").toBeDefined();
    expect(a11y[0], "accessibility must fail the build on regression").toBe("error");
    expect(a11y[1].minScore).toBeGreaterThanOrEqual(0.9);
  });

  it("configures best-practices and seo as warn-level ≥0.9 signals", () => {
    const { assertions } = config.ci.assert;

    for (const key of ["categories:best-practices", "categories:seo"] as const) {
      const rule = assertions[key];
      expect(rule, `${key} assertion must be configured`).toBeDefined();
      expect(rule[1].minScore).toBeGreaterThanOrEqual(0.9);
    }
  });
});
