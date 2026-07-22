import { z } from "zod";

const nonEmptyTrimmed = (fieldName: string, max = 120) =>
  z
    .string({
      required_error: `${fieldName} is required`,
      invalid_type_error: `${fieldName} is required`,
    })
    .trim()
    .min(1, `${fieldName} is required`)
    .max(max, `${fieldName} must be ${max} characters or fewer`);

const isoDateTime = z
  .string({
    required_error: "Start time is required",
    invalid_type_error: "Start time must be an ISO 8601 string",
  })
  .refine((value) => !Number.isNaN(new Date(value).getTime()), {
    message: "Start time must be an ISO 8601 string",
  });

const newClientSchema = z
  .object({
    name: nonEmptyTrimmed("Client name"),
    phone: nonEmptyTrimmed("Client phone", 40),
    email: z
      .string()
      .trim()
      .email("Client email must be a valid email address")
      .max(254, "Client email must be 254 characters or fewer")
      .optional(),
  })
  .strict();

export const manualBookingSchema = z
  .object({
    clientId: z.string().trim().min(1, "clientId cannot be empty").optional(),
    newClient: newClientSchema.optional(),
    serviceId: nonEmptyTrimmed("serviceId", 60),
    staffId: z.string().trim().min(1, "staffId cannot be empty").optional(),
    startsAt: isoDateTime,
    notes: z
      .string()
      .trim()
      .max(1000, "Notes must be 1000 characters or fewer")
      .optional(),
  })
  .strict()
  .refine((value) => Boolean(value.clientId) !== Boolean(value.newClient), {
    message: "Provide exactly one of clientId or newClient",
    path: ["_form"],
  });

export type ManualBookingInput = z.infer<typeof manualBookingSchema>;
