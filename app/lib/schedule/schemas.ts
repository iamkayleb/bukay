import { z } from "zod";

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm time");
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD date");

export const businessHourSchema = z
  .object({
    dayOfWeek: z.coerce.number().int().min(0).max(6),
    opensAt: timeSchema,
    closesAt: timeSchema,
  })
  .refine((value) => value.opensAt < value.closesAt, {
    message: "Opening time must be before closing time",
    path: ["closesAt"],
  });

export const blackoutSchema = z.object({
  date: dateSchema,
  reason: z.string().trim().max(120).optional().default(""),
});

export const updateScheduleSchema = z
  .object({
    businessHours: z.array(businessHourSchema).max(42),
    blackouts: z.array(blackoutSchema).max(50),
  })
  .superRefine((value, ctx) => {
    const blackoutDates = new Set<string>();

    value.blackouts.forEach((blackout, index) => {
      if (blackoutDates.has(blackout.date)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Blackout date must be unique",
          path: ["blackouts", index, "date"],
        });
      }

      blackoutDates.add(blackout.date);
    });
  });

export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;

export function normalizeScheduleInput(input: UpdateScheduleInput): UpdateScheduleInput {
  return {
    businessHours: [...input.businessHours].sort(
      (left, right) =>
        left.dayOfWeek - right.dayOfWeek ||
        left.opensAt.localeCompare(right.opensAt) ||
        left.closesAt.localeCompare(right.closesAt)
    ),
    blackouts: [...input.blackouts].sort((left, right) => left.date.localeCompare(right.date)),
  };
}
