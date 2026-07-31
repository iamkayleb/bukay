import { z } from "zod";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/;
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const RESERVED_SLUGS = new Set(["admin", "api", "app", "assets", "cdn", "static", "www"]);

export const settingsSchema = z.object({
  name: z.string().trim().min(1, "Business name is required").max(120, "Business name is too long"),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "Slug must be at least 3 characters")
    .max(63, "Slug must be 63 characters or fewer")
    .regex(SLUG_PATTERN, "Use lowercase letters, numbers, and hyphens only")
    .refine((slug) => !RESERVED_SLUGS.has(slug), "This slug is reserved"),
  timezone: z.string().trim().min(1, "Timezone is required").default("Africa/Lagos"),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .length(3, "Currency must be a 3-letter ISO code")
    .default("NGN"),
  logoUrl: z.string().trim().url("Logo URL must be a valid URL").optional().or(z.literal("")),
  brandColor: z
    .string()
    .trim()
    .regex(HEX_COLOR_PATTERN, "Brand color must be a 6-digit hex value")
    .default("#10b981"),
  cancellationPolicy: z
    .string()
    .trim()
    .max(2000, "Cancellation policy must be 2,000 characters or fewer")
    .default(""),
});

export type SettingsInput = z.infer<typeof settingsSchema>;
