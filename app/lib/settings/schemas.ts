import { z } from "zod";

export const DEFAULT_BRAND_COLOR = "#10b981";

export const brandColorSchema = z
  .string({
    required_error: "Brand color is required",
    invalid_type_error: "Brand color must be a hex color",
  })
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Brand color must be a 6-digit hex color");

const optionalTrimmedString = (maxLength: number, message: string) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? null : value),
    z.string().trim().max(maxLength, message).nullable()
  );

export const updateSettingsSchema = z
  .object({
    name: z
      .string({ invalid_type_error: "Business name is required" })
      .trim()
      .min(1, "Business name is required")
      .max(120, "Business name must be 120 characters or fewer")
      .optional(),
    slug: z
      .string({ invalid_type_error: "Slug must be text" })
      .trim()
      .min(3, "Slug must be at least 3 characters")
      .max(63, "Slug must be 63 characters or fewer")
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug can use lowercase letters, numbers, and hyphens")
      .optional(),
    brandColor: brandColorSchema.optional(),
    logoUrl: optionalTrimmedString(500, "Logo URL must be 500 characters or fewer").optional(),
    cancellationPolicy: optionalTrimmedString(
      2_000,
      "Cancellation policy must be 2,000 characters or fewer"
    ).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one settings field is required",
    path: ["_form"],
  });

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
