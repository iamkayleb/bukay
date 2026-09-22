/**
 * Catalog of Meta WhatsApp message templates used by Bukay.
 *
 * Each entry must be submitted for approval in Meta Business Manager before
 * live sends. See `docs/WHATSAPP_TEMPLATES.md` for the approval workflow and
 * the parameter mapping for every template below.
 */

export type WhatsAppTemplateCategory = "UTILITY" | "MARKETING" | "AUTHENTICATION";

export type WhatsAppTemplateDefinition = {
  /** Meta template name (snake_case, stable once approved). */
  name: string;
  /** Default language code submitted with the template. */
  language: string;
  category: WhatsAppTemplateCategory;
  /** Human-readable purpose for operators and docs. */
  description: string;
  /** Ordered body placeholder labels matching `{{1}}`, `{{2}}`, … */
  bodyPlaceholders: readonly string[];
  /** Example body text as submitted to Meta (placeholders as `{{n}}`). */
  bodyExample: string;
};

export const WHATSAPP_TEMPLATES = {
  greeting: {
    name: "greeting",
    language: "en",
    category: "UTILITY",
    description:
      "Welcome message for unknown inbound senders starting a booking conversation.",
    bodyPlaceholders: ["business_name"],
    bodyExample:
      "Hi! Welcome to {{1}}. Reply with the service you need or tap Book to get started.",
  },
  booking_created: {
    name: "booking_created",
    language: "en",
    category: "UTILITY",
    description: "Sent when a guest creates a new booking (pending confirmation).",
    bodyPlaceholders: ["client_name", "service_name", "starts_at", "business_name"],
    bodyExample:
      "Hi {{1}}, your booking for {{2}} on {{3}} at {{4}} was created. We will confirm shortly.",
  },
  booking_confirmed: {
    name: "booking_confirmed",
    language: "en",
    category: "UTILITY",
    description: "Sent when the merchant confirms a booking.",
    bodyPlaceholders: ["client_name", "service_name", "starts_at", "business_name"],
    bodyExample:
      "Hi {{1}}, your {{2}} appointment on {{3}} at {{4}} is confirmed. See you then!",
  },
  booking_cancelled: {
    name: "booking_cancelled",
    language: "en",
    category: "UTILITY",
    description: "Sent when a booking is cancelled by guest or merchant.",
    bodyPlaceholders: ["client_name", "service_name", "starts_at", "business_name"],
    bodyExample:
      "Hi {{1}}, your {{2}} appointment on {{3}} at {{4}} has been cancelled.",
  },
  booking_rescheduled: {
    name: "booking_rescheduled",
    language: "en",
    category: "UTILITY",
    description: "Sent when a booking is moved to a new start time.",
    bodyPlaceholders: [
      "client_name",
      "service_name",
      "previous_starts_at",
      "new_starts_at",
      "business_name",
    ],
    bodyExample:
      "Hi {{1}}, your {{2}} appointment moved from {{3}} to {{4}} at {{5}}.",
  },
  booking_reminder: {
    name: "booking_reminder",
    language: "en",
    category: "UTILITY",
    description: "T-24h / T-2h reminder before an upcoming appointment.",
    bodyPlaceholders: ["client_name", "service_name", "starts_at", "business_name"],
    bodyExample:
      "Hi {{1}}, reminder: {{2}} is coming up on {{3}} at {{4}}. Reply STOP to opt out of reminders.",
  },
} as const satisfies Record<string, WhatsAppTemplateDefinition>;

export type WhatsAppTemplateKey = keyof typeof WHATSAPP_TEMPLATES;

export function getWhatsAppTemplate(key: WhatsAppTemplateKey): WhatsAppTemplateDefinition {
  return WHATSAPP_TEMPLATES[key];
}

export function listWhatsAppTemplates(): WhatsAppTemplateDefinition[] {
  return Object.values(WHATSAPP_TEMPLATES);
}

export function findWhatsAppTemplateByName(
  name: string
): WhatsAppTemplateDefinition | undefined {
  return listWhatsAppTemplates().find((template) => template.name === name);
}
