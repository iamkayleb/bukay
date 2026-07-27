import { z } from "zod";

const idSchema = z
  .string({ required_error: "ID is required", invalid_type_error: "ID is required" })
  .trim()
  .min(1, "ID is required");

const existingClientSchema = z
  .object({
    id: idSchema,
  })
  .strict();

const newClientSchema = z
  .object({
    name: z
      .string({
        required_error: "Client name is required",
        invalid_type_error: "Client name is required",
      })
      .trim()
      .min(1, "Client name is required")
      .max(120, "Client name must be 120 characters or fewer"),
    phone: z
      .string({
        required_error: "Phone is required",
        invalid_type_error: "Phone is required",
      })
      .trim()
      .min(1, "Phone is required")
      .max(40, "Phone must be 40 characters or fewer"),
    email: z
      .string()
      .trim()
      .email("Enter a valid email")
      .max(254, "Email must be 254 characters or fewer")
      .nullable()
      .optional()
      .or(z.literal("")),
  })
  .strict();

function dateField(fieldName: string) {
  return z
    .string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} is required`,
    })
    .trim()
    .datetime({ message: `${fieldName} must be a valid date and time` });
}

export const createManualBookingSchema = z
  .object({
    client: z.union([existingClientSchema, newClientSchema]),
    serviceId: idSchema,
    staffId: idSchema.nullable().optional(),
    startsAt: dateField("Start time"),
    endsAt: dateField("End time").optional(),
    notes: z
      .string({ invalid_type_error: "Notes must be text" })
      .trim()
      .max(2_000, "Notes must be 2000 characters or fewer")
      .nullable()
      .optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (!("id" in value.client) && !value.client.email) {
      value.client.email = null;
    }

    if (value.endsAt && Date.parse(value.endsAt) <= Date.parse(value.startsAt)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "End time must be after start time",
        path: ["endsAt"],
      });
    }
  });

export type CreateManualBookingInput = z.infer<typeof createManualBookingSchema>;
