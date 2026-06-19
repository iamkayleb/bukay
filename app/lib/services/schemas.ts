import { z } from "zod";

const positiveInt = z.number().int().positive();
const nonNegativeInt = z.number().int().nonnegative();

export const serviceNameSchema = z
  .string()
  .trim()
  .min(1, "Name is required")
  .max(120, "Name must be 120 characters or fewer");

const serviceFields = {
  name: serviceNameSchema,
  durationMinutes: positiveInt.max(24 * 60, "Duration cannot exceed 24 hours"),
  priceKobo: nonNegativeInt.max(1_000_000_000, "Price is too large"),
  bufferMinutes: nonNegativeInt.max(24 * 60, "Buffer cannot exceed 24 hours"),
  active: z.boolean(),
};

export const createServiceSchema = z.object({
  ...serviceFields,
  bufferMinutes: serviceFields.bufferMinutes.default(0),
  active: serviceFields.active.default(true),
});

export const updateServiceSchema = z
  .object(serviceFields)
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field is required",
  });

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;

export type FieldErrors = Record<string, string[]>;

export function flattenFieldErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (out[key] ||= []).push(issue.message);
  }
  return out;
}
