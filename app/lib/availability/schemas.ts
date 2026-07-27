import { z } from "zod";

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const businessHourSchema = z
  .object({
    dayOfWeek: z.number().int().min(0).max(6),
    opensAt: z.string().regex(TIME_PATTERN, "Open time must use HH:mm"),
    closesAt: z.string().regex(TIME_PATTERN, "Close time must use HH:mm"),
  })
  .refine((value) => value.opensAt < value.closesAt, {
    message: "Close time must be after open time",
    path: ["closesAt"],
  });

const blackoutSchema = z.object({
  date: z.string().regex(DATE_PATTERN, "Date must use YYYY-MM-DD"),
  reason: z.string().trim().max(160, "Reason must be 160 characters or fewer").optional(),
});

export const updateAvailabilitySchema = z
  .object({
    businessHours: z.array(businessHourSchema).max(28),
    blackouts: z.array(blackoutSchema).max(60),
  })
  .strict();

export type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;
