export type WhatsAppTemplateCategory = "UTILITY" | "AUTHENTICATION" | "MARKETING";

export type WhatsAppTemplate = {
  name: string;
  language: string;
  category: WhatsAppTemplateCategory;
  /** Names of the positional body variables, in order ({{1}}, {{2}}, ...). */
  params: readonly string[];
  description: string;
};

export const WHATSAPP_TEMPLATES = {
  booking_confirmation: {
    name: "booking_confirmation",
    language: "en",
    category: "UTILITY",
    params: ["customerName", "serviceName", "startsAt", "businessName"],
    description: "Sent to a customer once a booking is confirmed.",
  },
  booking_reminder: {
    name: "booking_reminder",
    language: "en",
    category: "UTILITY",
    params: ["customerName", "serviceName", "startsAt"],
    description: "Reminder sent ahead of an upcoming appointment.",
  },
  booking_cancellation: {
    name: "booking_cancellation",
    language: "en",
    category: "UTILITY",
    params: ["customerName", "serviceName", "businessName"],
    description: "Sent when a booking is cancelled.",
  },
  otp_code: {
    name: "otp_code",
    language: "en",
    category: "AUTHENTICATION",
    params: ["code"],
    description: "One-time sign-in code.",
  },
} as const satisfies Record<string, WhatsAppTemplate>;

export type WhatsAppTemplateName = keyof typeof WHATSAPP_TEMPLATES;

export function getTemplate(name: string): WhatsAppTemplate | undefined {
  return Object.prototype.hasOwnProperty.call(WHATSAPP_TEMPLATES, name)
    ? WHATSAPP_TEMPLATES[name as WhatsAppTemplateName]
    : undefined;
}

/** Orders named params to match the template's positional variables. Throws on missing ones. */
export function renderTemplateParams(
  template: WhatsAppTemplate,
  values: Record<string, string>
): string[] {
  return template.params.map((key) => {
    const value = values[key];
    if (value === undefined || value === "") {
      throw new Error(`Template '${template.name}' missing param '${key}'`);
    }
    return value;
  });
}
