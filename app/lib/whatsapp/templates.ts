/** Meta's approved template categories. */
export type WhatsAppTemplateCategory = "AUTHENTICATION" | "MARKETING" | "UTILITY";

/**
 * Metadata that must stay aligned with an approved Meta WhatsApp template.
 * Parameters are supplied to the provider in the declared positional order.
 */
export type WhatsAppTemplate = {
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  parameters: readonly string[];
  description: string;
};

/**
 * Templates available to Bukay's messaging flows.
 *
 * Do not add an entry until its corresponding template has been submitted for
 * approval; see docs/WHATSAPP_TEMPLATES.md for the operational process.
 */
export const WHATSAPP_TEMPLATES = {
  welcome: {
    name: "welcome",
    language: "en_US",
    category: "UTILITY",
    parameters: ["businessName"],
    description: "Sent when an unknown sender first messages a business.",
  },
  booking_confirmation: {
    name: "booking_confirmation",
    language: "en_US",
    category: "UTILITY",
    parameters: ["customerName", "serviceName", "startsAt", "businessName"],
    description: "Sent after a customer booking is confirmed.",
  },
  booking_reminder: {
    name: "booking_reminder",
    language: "en_US",
    category: "UTILITY",
    parameters: ["customerName", "serviceName", "startsAt"],
    description: "Sent before an upcoming appointment.",
  },
  booking_cancellation: {
    name: "booking_cancellation",
    language: "en_US",
    category: "UTILITY",
    parameters: ["customerName", "serviceName", "businessName"],
    description: "Sent when a booking is cancelled.",
  },
  otp_code: {
    name: "otp_code",
    language: "en_US",
    category: "AUTHENTICATION",
    parameters: ["code"],
    description: "One-time code used to sign in.",
  },
} as const satisfies Record<string, WhatsAppTemplate>;

export type WhatsAppTemplateName = keyof typeof WHATSAPP_TEMPLATES;

/** Looks up an approved template without allowing arbitrary provider template names. */
export function getWhatsAppTemplate(name: string): WhatsAppTemplate | undefined {
  if (!Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, name)) return undefined;
  return WHATSAPP_TEMPLATES[name as WhatsAppTemplateName];
}

/** Converts named values to the positional values expected by Meta's API. */
export function templateParameters(
  template: WhatsAppTemplate,
  values: Readonly<Record<string, string>>
): string[] {
  return template.parameters.map((parameter) => {
    const value = values[parameter];
    if (!value) {
      throw new Error(`Template '${template.name}' is missing parameter '${parameter}'`);
    }
    return value;
  });
}
