import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MIGRATION_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "prisma",
  "migrations",
  "20260722000000_booking_no_overlap_exclusion",
  "migration.sql"
);

describe("Booking no-overlap exclusion migration", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("enables btree_gist so GiST can index the staffId equality column", () => {
    expect(sql).toMatch(/CREATE EXTENSION IF NOT EXISTS btree_gist/i);
  });

  it("adds an EXCLUDE constraint on the Booking table using GiST", () => {
    expect(sql).toMatch(/ALTER TABLE "Booking"/);
    expect(sql).toMatch(/ADD CONSTRAINT "Booking_no_overlap_per_staff"/);
    expect(sql).toMatch(/EXCLUDE USING gist/i);
  });

  it("excludes rows on (staffId =, tstzrange(startsAt, endsAt) &&)", () => {
    expect(sql).toMatch(/"staffId"\s+WITH\s+=/);
    expect(sql).toMatch(/tstzrange\("startsAt",\s*"endsAt",\s*'\[\)'\)\s+WITH\s+&&/);
  });

  it("scopes the constraint so cancelled and unassigned bookings do not conflict", () => {
    expect(sql).toMatch(/WHERE\s*\(\s*"staffId"\s+IS\s+NOT\s+NULL/i);
    expect(sql).toMatch(/"status"\s*<>\s*'cancelled'/);
  });
});
