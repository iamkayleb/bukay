import { z } from "zod";
import { normalizeIsoDate } from "./iso-date";

const TIME = /^([0-1]\d|2[0-3]):([0-5]\d)$/;

// One open→close window within a weekday. `closesAt` must be strictly after
// `opensAt`; the schedule model does not support overnight windows.
export const scheduleWindowSchema = z
  .object({
    opensAt: z.string().regex(TIME, "opensAt must be HH:mm (24-hour)"),
    closesAt: z.string().regex(TIME, "closesAt must be HH:mm (24-hour)"),
  })
  .refine((value) => toMinutes(value.opensAt) < toMinutes(value.closesAt), {
    message: "closesAt must be after opensAt",
    path: ["closesAt"],
  });

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

// The full weekly schedule payload the PUT /api/schedule endpoint accepts.
// `days` is an object keyed by dayOfWeek (0–6, Sunday-first). Each entry
// carries zero or more open windows; an empty array means the tenant is
// closed that day. Missing keys are treated as "closed all day".
export const scheduleUpdateSchema = z.object({
  days: z.record(
    z.string().regex(/^[0-6]$/, "dayOfWeek must be 0-6"),
    z.array(scheduleWindowSchema)
  ),
});

export type ScheduleUpdatePayload = z.infer<typeof scheduleUpdateSchema>;
export type ScheduleWindow = z.infer<typeof scheduleWindowSchema>;

// Body for POST /api/blackout. `date` is normalized to YYYY-MM-DD before it
// hits the database; anything the ISO helper accepts is accepted here.
export const blackoutCreateSchema = z.object({
  date: z.union([z.string(), z.date()]).transform((value, ctx) => {
    try {
      return normalizeIsoDate(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "invalid date",
      });
      return z.NEVER;
    }
  }),
  reason: z.string().max(200).nullish(),
});

export const blackoutDeleteSchema = z.object({
  date: z.union([z.string(), z.date()]).transform((value, ctx) => {
    try {
      return normalizeIsoDate(value);
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "invalid date",
      });
      return z.NEVER;
    }
  }),
});

export type BlackoutCreatePayload = z.infer<typeof blackoutCreateSchema>;
