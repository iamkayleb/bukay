import { z } from "zod";

export const BRAND_COLOR_CONTRAST_TARGET = 4.5;
export const DEFAULT_BRAND_COLOR = "#047857";

type RgbColor = {
  red: number;
  green: number;
  blue: number;
};

function hexChannelToLinear(channel: number) {
  const normalized = channel / 255;

  return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
}

function parseHexColor(color: string): RgbColor | null {
  const match = /^#([0-9a-fA-F]{6})$/.exec(color.trim());
  if (!match) {
    return null;
  }

  const value = match[1];
  return {
    red: Number.parseInt(value.slice(0, 2), 16),
    green: Number.parseInt(value.slice(2, 4), 16),
    blue: Number.parseInt(value.slice(4, 6), 16),
  };
}

export function getRelativeLuminance(color: string) {
  const rgb = parseHexColor(color);
  if (!rgb) {
    return null;
  }

  return (
    0.2126 * hexChannelToLinear(rgb.red) +
    0.7152 * hexChannelToLinear(rgb.green) +
    0.0722 * hexChannelToLinear(rgb.blue)
  );
}

export function getContrastRatio(foreground: string, background: string) {
  const foregroundLuminance = getRelativeLuminance(foreground);
  const backgroundLuminance = getRelativeLuminance(background);

  if (foregroundLuminance === null || backgroundLuminance === null) {
    return null;
  }

  const lighter = Math.max(foregroundLuminance, backgroundLuminance);
  const darker = Math.min(foregroundLuminance, backgroundLuminance);

  return (lighter + 0.05) / (darker + 0.05);
}

export function getBrandColorContrastRatio(color: string) {
  return getContrastRatio("#ffffff", color);
}

export function hasBrandColorContrast(color: string) {
  const ratio = getBrandColorContrastRatio(color);

  return ratio !== null && ratio >= BRAND_COLOR_CONTRAST_TARGET;
}

export const brandColorSchema = z
  .string({
    required_error: "Brand color is required",
    invalid_type_error: "Brand color must be a hex color",
  })
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Brand color must be a 6-digit hex color")
  .refine(hasBrandColorContrast, {
    message: `Brand color must have at least ${BRAND_COLOR_CONTRAST_TARGET}:1 contrast with white text`,
  });

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
