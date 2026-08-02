import { z } from "zod";

export const TAG_NAME_MAX_LENGTH = 40;

export function normalizeTagName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export const clientTagSchema = z.object({
  name: z
    .string()
    .transform(normalizeTagName)
    .pipe(
      z
        .string()
        .min(1, "Tag name is required")
        .max(TAG_NAME_MAX_LENGTH, `Tag name must be ${TAG_NAME_MAX_LENGTH} characters or fewer`)
    ),
});
