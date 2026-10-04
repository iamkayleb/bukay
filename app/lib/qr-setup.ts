import { prisma } from "@/app/db/prisma";
import { QrPdfError, normalizeBookingSlug, sendQrPdfToOwner } from "@/app/lib/qr-pdf";
import type { WhatsAppProvider, WhatsAppSendResult } from "@/app/lib/whatsapp/provider";

/**
 * After setup, deliver the branded booking QR PDF to the owner's WhatsApp.
 * The destination is the tenant WhatsApp number captured during setup.
 */
export async function deliverQrPdfAfterSetup(input: {
  slug: string;
  provider: WhatsAppProvider;
  baseUrl?: string;
}): Promise<WhatsAppSendResult> {
  const slug = normalizeBookingSlug(input.slug);
  const tenant = await prisma.tenant.findUnique({
    where: { slug },
    select: { name: true, slug: true, whatsappNumber: true },
  });

  if (!tenant) {
    throw new QrPdfError("tenant not found");
  }
  if (!tenant.whatsappNumber?.trim()) {
    throw new QrPdfError("owner WhatsApp number is not set");
  }

  return sendQrPdfToOwner({
    tenantName: tenant.name,
    slug: tenant.slug,
    ownerPhone: tenant.whatsappNumber,
    provider: input.provider,
    baseUrl: input.baseUrl,
  });
}
