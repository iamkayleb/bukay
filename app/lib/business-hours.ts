import { z } from "zod";

/** 0 = Sunday … 6 = Saturday, matching `Date#getUTCDay()` and the seed. */
export const DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

/** Times stored on a closed day when the merchant never set any. */
export const DEFAULT_OPENS_AT = "09:00";
export const DEFAULT_CLOSES_AT = "18:00";

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

export type BusinessHourRow = {
  dayOfWeek: number;
  opensAt: string;
  closesAt: string;
  isClosed: boolean;
};

export function isValidClockTime(value: unknown): value is string {
  return typeof value === "string" && HH_MM.test(value);
}

const rowSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: z.string().optional(),
    closesAt: z.string().optional(),
    isClosed: z.boolean().default(false),
  })
  .superRefine((row, ctx) => {
    // A closed day is closed regardless of its times, so they are not validated.
    if (row.isClosed) return;
    if (!isValidClockTime(row.opensAt)) {
      ctx.addIssue({ code: "custom", path: ["opensAt"], message: "opensAt must be HH:MM" });
    }
    if (!isValidClockTime(row.closesAt)) {
      ctx.addIssue({ code: "custom", path: ["closesAt"], message: "closesAt must be HH:MM" });
    }
    if (
      isValidClockTime(row.opensAt) &&
      isValidClockTime(row.closesAt) &&
      row.opensAt >= row.closesAt
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["closesAt"],
        message: "opensAt must be before closesAt",
      });
    }
  });

export const replaceBusinessHoursSchema = z
  .object({ hours: z.array(rowSchema).length(7, "hours must contain all seven days") })
  .superRefine((body, ctx) => {
    const seen = new Set(body.hours.map((row) => row.dayOfWeek));
    if (seen.size !== 7) {
      ctx.addIssue({
        code: "custom",
        path: ["hours"],
        message: "hours must contain each dayOfWeek 0-6 exactly once",
      });
    }
  });

export type ReplaceBusinessHoursInput = z.infer<typeof replaceBusinessHoursSchema>;

/**
 * Storage values for a validated row. Closed rows keep any well-formed times the
 * merchant entered (so reopening restores them) and otherwise fall back to the
 * defaults, because the columns are non-nullable.
 */
export function toStoredRow(row: ReplaceBusinessHoursInput["hours"][number]): BusinessHourRow {
  return {
    dayOfWeek: row.dayOfWeek,
    opensAt: isValidClockTime(row.opensAt) ? row.opensAt : DEFAULT_OPENS_AT,
    closesAt: isValidClockTime(row.closesAt) ? row.closesAt : DEFAULT_CLOSES_AT,
    isClosed: row.isClosed,
  };
}

/** Seven rows ordered Sunday→Saturday; a day with no stored row is closed. */
export function fillWeek(rows: BusinessHourRow[]): BusinessHourRow[] {
  const byDay = new Map(rows.map((row) => [row.dayOfWeek, row]));
  return DAYS_OF_WEEK.map((dayOfWeek) => {
    const row = byDay.get(dayOfWeek);
    return row
      ? {
          dayOfWeek,
          opensAt: row.opensAt,
          closesAt: row.closesAt,
          isClosed: row.isClosed,
        }
      : { dayOfWeek, opensAt: DEFAULT_OPENS_AT, closesAt: DEFAULT_CLOSES_AT, isClosed: true };
  });
}
