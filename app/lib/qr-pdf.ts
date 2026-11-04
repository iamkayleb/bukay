import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";

import type { WhatsAppProvider, WhatsAppSendResult } from "@/app/lib/whatsapp/provider";

/** PNG options shared by generation and tests so the matrix can be compared. */
export const QR_PNG_OPTIONS = {
  type: "png" as const,
  errorCorrectionLevel: "M" as const,
  margin: 1,
  width: 512,
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export class QrPdfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QrPdfError";
  }
}

/** Lowercase public slug, or throw when it cannot be a booking path segment. */
export function normalizeBookingSlug(slug: string): string {
  const normalized = slug.trim().toLowerCase();
  if (!SLUG_PATTERN.test(normalized)) {
    throw new QrPdfError("slug is invalid");
  }
  return normalized;
}

/**
 * Public booking path the QR encodes. Scanning the code opens this path.
 */
export function bookingPathForSlug(slug: string): string {
  return `/${normalizeBookingSlug(slug)}`;
}

export function resolvePublicBaseUrl(baseUrl?: string): string {
  const raw = (
    baseUrl ??
    process.env.NEXT_PUBLIC_APP_URL ??
    process.env.ROOT_HOST ??
    "http://localhost:3000"
  )
    .trim()
    .replace(/\/+$/, "");
  if (!raw) {
    return "http://localhost:3000";
  }
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/** Absolute shop URL whose pathname is `/{slug}`. */
export function bookingUrlForSlug(slug: string, baseUrl?: string): string {
  return `${resolvePublicBaseUrl(baseUrl)}${bookingPathForSlug(slug)}`;
}

export type BrandedQrPdf = {
  /** PDF bytes beginning with `%PDF`. */
  pdf: Uint8Array;
  /** PNG QR whose payload is `bookingUrl`. */
  qrPng: Buffer;
  bookingPath: string;
  bookingUrl: string;
  filename: string;
};

function pdfSafeText(value: string, fallback: string): string {
  const ascii = Array.from(value)
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code >= 32 && code <= 126;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  return ascii || fallback;
}

/**
 * Branded one-page PDF: tenant name, booking URL, and a QR that opens `/{slug}`.
 */
export async function buildBrandedQrPdf(input: {
  tenantName: string;
  slug: string;
  baseUrl?: string;
}): Promise<BrandedQrPdf> {
  const bookingPath = bookingPathForSlug(input.slug);
  const bookingUrl = bookingUrlForSlug(input.slug, input.baseUrl);
  const slug = bookingPath.slice(1);
  const tenantName = pdfSafeText(input.tenantName, slug);
  const qrPng = await QRCode.toBuffer(bookingUrl, QR_PNG_OPTIONS);

  const pdf = await PDFDocument.create();
  pdf.setTitle(`${tenantName} booking QR`);
  pdf.setAuthor(tenantName);
  pdf.setSubject(bookingUrl);
  pdf.setKeywords([bookingPath, bookingUrl]);
  pdf.setCreator("Bukay");
  pdf.setProducer("Bukay");

  const page = pdf.addPage([595.28, 841.89]);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const emerald = rgb(0.02, 0.47, 0.34);
  const ink = rgb(0.06, 0.09, 0.16);
  const muted = rgb(0.28, 0.33, 0.4);

  page.drawRectangle({ x: 0, y: 760, width: 595.28, height: 82, color: emerald });
  page.drawText("Bukay", {
    x: 48,
    y: 800,
    size: 12,
    font: bold,
    color: rgb(0.85, 0.98, 0.93),
  });
  page.drawText(tenantName, {
    x: 48,
    y: 772,
    size: 26,
    font: bold,
    color: rgb(1, 1, 1),
  });

  page.drawText("Scan to book", {
    x: 48,
    y: 710,
    size: 20,
    font: bold,
    color: ink,
  });
  page.drawText("Walk-in customers open the shop by scanning this code.", {
    x: 48,
    y: 686,
    size: 12,
    font: regular,
    color: muted,
  });
  page.drawText(bookingUrl, {
    x: 48,
    y: 658,
    size: 12,
    font: regular,
    color: ink,
  });
  page.drawText(bookingPath, {
    x: 48,
    y: 640,
    size: 12,
    font: bold,
    color: emerald,
  });

  const image = await pdf.embedPng(qrPng);
  const size = 320;
  page.drawImage(image, {
    x: (595.28 - size) / 2,
    y: 280,
    width: size,
    height: size,
  });

  page.drawText(`${tenantName} · ${bookingPath}`, {
    x: 48,
    y: 72,
    size: 11,
    font: regular,
    color: muted,
  });

  const bytes = await pdf.save({ useObjectStreams: false });
  return {
    pdf: bytes,
    qrPng,
    bookingPath,
    bookingUrl,
    filename: `${slug}-booking-qr.pdf`,
  };
}

/**
 * Send the branded QR PDF to the owner on WhatsApp.
 * Called once tenant setup has a name, slug, and owner phone.
 */
export async function sendQrPdfToOwner(input: {
  tenantName: string;
  slug: string;
  ownerPhone: string;
  provider: WhatsAppProvider;
  baseUrl?: string;
}): Promise<WhatsAppSendResult> {
  const ownerPhone = input.ownerPhone?.trim();
  if (!ownerPhone) {
    throw new QrPdfError("owner phone is required");
  }

  const branded = await buildBrandedQrPdf({
    tenantName: input.tenantName,
    slug: input.slug,
    baseUrl: input.baseUrl,
  });
  const fileUrl = `${resolvePublicBaseUrl(input.baseUrl)}/api/qr/${branded.bookingPath.slice(1)}`;

  return input.provider.send({
    to: ownerPhone,
    content: {
      kind: "document",
      filename: branded.filename,
      mimeType: "application/pdf",
      caption: `Your ${pdfSafeText(input.tenantName, branded.bookingPath.slice(1))} booking QR is ready. Scanning it opens ${branded.bookingPath}.`,
      link: fileUrl,
      dataBase64: Buffer.from(branded.pdf).toString("base64"),
    },
  });
}
