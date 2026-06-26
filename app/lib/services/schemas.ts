import { z } from "zod";

const MAX_PRICE_KOBO = 100_000_000;

type NumberRule = (schema: z.ZodNumber) => z.ZodNumber;

function integerField(fieldName: string, rule: NumberRule) {
  return z.preprocess(
    (value) => {
      if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed === "" ? value : Number(trimmed);
      }
      return value;
    },
    rule(
      z
        .number({
          required_error: `${fieldName} is required`,
          invalid_type_error: `${fieldName} must be a number`,
        })
        .int(`${fieldName} must be a whole number`)
    )
  );
}

function boundedIntegerField(
  fieldName: string,
  min: { value: number; message: string },
  max: { value: number; message: string }
) {
  return integerField(fieldName, (schema) =>
    schema.min(min.value, min.message).max(max.value, max.message)
  );
}

const serviceBaseSchema = z
  .object({
    name: z
      .string({ required_error: "Name is required", invalid_type_error: "Name is required" })
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or fewer"),
    durationMinutes: boundedIntegerField(
      "Duration",
      { value: 1, message: "Duration must be at least 1 minute" },
      { value: 1_440, message: "Duration must be 24 hours or less" }
    ),
    priceKobo: boundedIntegerField(
      "Price",
      { value: 0, message: "Price cannot be negative" },
      { value: MAX_PRICE_KOBO, message: "Price is too large" }
    ),
    bufferMinutes: boundedIntegerField(
      "Buffer",
      { value: 0, message: "Buffer cannot be negative" },
      { value: 480, message: "Buffer must be 8 hours or less" }
    ),
    active: z.boolean({ invalid_type_error: "Active must be true or false" }),
  })
  .strict();

export const createServiceSchema = serviceBaseSchema.extend({
  bufferMinutes: serviceBaseSchema.shape.bufferMinutes.default(0),
  active: serviceBaseSchema.shape.active.default(true),
});

export const updateServiceSchema = serviceBaseSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one service field is required",
    path: ["_form"],
  });

export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type UpdateServiceInput = z.infer<typeof updateServiceSchema>;
