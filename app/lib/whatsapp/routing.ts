import { prisma } from "@/app/db/prisma";

/** Normalizes the format Meta uses for phone numbers to E.164. */
export function normalizeWhatsAppNumber(number: string): string | null {
  const digits = number
    .trim()
    .replace(/^\+/, "")
    .replace(/[^0-9]/g, "");
  return digits.length >= 7 && digits.length <= 15 ? `+${digits}` : null;
}

/** Resolves the tenant that owns an inbound business WhatsApp number. */
export async function resolveTenantByWhatsAppNumber(number: string) {
  const whatsappNumber = normalizeWhatsAppNumber(number);
  if (!whatsappNumber) return null;

  return prisma.tenant.findUnique({
    where: { whatsappNumber },
    select: { id: true, name: true },
  });
}
