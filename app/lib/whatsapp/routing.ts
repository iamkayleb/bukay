import { tryNormalizeNigerianPhone } from "@/app/lib/auth/phone";

/**
 * Tenant row addressed by its WhatsApp business number.
 * `whatsappNumber` is stored as digits only (no `+`, spaces, or punctuation).
 */
export type TenantByNumber = {
  id: string;
  name: string;
  whatsappNumber: string | null;
};

export type TenantNumberLookup = {
  findByWhatsAppNumber(number: string): Promise<TenantByNumber | null>;
};

/**
 * Digits-only form used to match Tenant.whatsappNumber.
 * Returns null when the input has no digits.
 */
export function normalizeWhatsAppNumber(input: string): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}

/**
 * Canonical customer phone stored on Conversation and matched to Client.phone.
 * Nigerian mobiles become E.164 (`+234…`). Other numbers keep a leading `+`.
 */
export function canonicalCustomerPhone(input: string): string | null {
  if (typeof input !== "string") return null;
  const direct = tryNormalizeNigerianPhone(input);
  if (direct) return direct;

  const digits = input.replace(/\D/g, "");
  if (!digits) return null;

  const withCountry = tryNormalizeNigerianPhone(`+${digits}`);
  if (withCountry) return withCountry;
  return `+${digits}`;
}

/**
 * Resolve the tenant that owns the WhatsApp business number on an inbound webhook.
 * Matches `metadata.display_phone_number` (or a phone number id stored the same way)
 * against Tenant.whatsappNumber after digit normalization.
 */
export async function resolveTenantByNumber(
  lookup: TenantNumberLookup,
  businessNumber: string
): Promise<TenantByNumber | null> {
  const normalized = normalizeWhatsAppNumber(businessNumber);
  if (!normalized) return null;
  return lookup.findByWhatsAppNumber(normalized);
}
