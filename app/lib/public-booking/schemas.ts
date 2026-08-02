import { z } from "zod";

import { InvalidPhoneNumberError, normalizeNigerianPhone } from "@/app/lib/auth/phone";

export const bookingClientDetailsSchema = z
  .object({
    name: z
      .string({ required_error: "Name is required", invalid_type_error: "Name is required" })
      .trim()
      .min(1, "Name is required")
      .max(120, "Name must be 120 characters or fewer"),
    phone: z
      .string({
        required_error: "Phone number is required",
        invalid_type_error: "Phone number is required",
      })
      .transform((value, ctx) => {
        try {
          return normalizeNigerianPhone(value);
        } catch (error) {
          if (error instanceof InvalidPhoneNumberError) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: "Enter a valid Nigerian phone number",
            });
            return z.NEVER;
          }

          throw error;
        }
      }),
  })
  .strict();

export type BookingClientDetailsInput = z.infer<typeof bookingClientDetailsSchema>;
