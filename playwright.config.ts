import { defineConfig } from "@playwright/test";

/**
 * UI acceptance specs only.
 *
 * These exist to prove acceptance criteria about the interface, which the
 * verifier cannot otherwise check: its contract is to read CI results, not to
 * run anything. Each spec tags the criterion it proves in its title --
 * `test('[AC-2] ...')` -- and CI turns that into a per-criterion table.
 * See docs/guides/UI_ACCEPTANCE.md in the Workflows repo.
 *
 * This is not where components get unit tests. Those live in __tests__/ and
 * run under vitest, where they cost milliseconds instead of a browser.
 *
 * No `projects` block on purpose: the shared CI lane passes `--browser=` and a
 * projects list would override it.
 */
export default defineConfig({
  testDir: "./e2e",
  // Serial locally and in CI. The flow books a real appointment against a real
  // seeded database; parallel workers racing for the same slot fail for a
  // reason that has nothing to do with the code under test.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.BASE_URL ?? "http://localhost:3000",
    trace: "off",
  },
});
