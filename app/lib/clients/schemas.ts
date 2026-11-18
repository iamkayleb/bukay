import { z } from "zod";

import { tryNormalizeNigerianPhone } from "@/app/lib/phone";

// Phones are stored as E.164 so a walk-in added here and the same person booking
// online land on one row under @@unique([tenantId, phone]).
export const createClientSchema = z
  .object({
    name: z
      .string({ required_error: "Name is required", invalid_type_error: "Name is required" })
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or fewer"),
    phone: z
      .string({ required_error: "Phone is required", invalid_type_error: "Phone is required" })
      .trim()
      .min(1, "Phone is required")
      .transform((value, ctx) => {
        const normalized = tryNormalizeNigerianPhone(value);
        if (!normalized) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Enter a valid Nigerian mobile number",
          });
          return z.NEVER;
        }
        return normalized;
      }),
  })
  .strict();

export type CreateClientInput = z.infer<typeof createClientSchema>;
