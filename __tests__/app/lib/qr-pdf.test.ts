import { PDFDocument } from "pdf-lib";
import QRCode from "qrcode";
import { describe, expect, it } from "vitest";

import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import {
  QR_PNG_OPTIONS,
  bookingPathForSlug,
  bookingUrlForSlug,
  buildBrandedQrPdf,
  sendQrPdfToOwner,
} from "@/app/lib/qr-pdf";

describe("branded booking QR PDF", () => {
  it("encodes a booking URL whose path is /{slug}", async () => {
    const branded = await buildBrandedQrPdf({
      tenantName: "Ada Salon",
      slug: "Ada-Salon",
      baseUrl: "https://bukay.test",
    });

    expect(branded.bookingPath).toBe("/ada-salon");
    expect(bookingPathForSlug("Ada-Salon")).toBe("/ada-salon");
    expect(new URL(branded.bookingUrl).pathname).toBe("/ada-salon");
    expect(bookingUrlForSlug("ada-salon", "https://bukay.test")).toBe(
      "https://bukay.test/ada-salon"
    );

    const independent = await QRCode.toBuffer(branded.bookingUrl, QR_PNG_OPTIONS);
    expect(Buffer.compare(branded.qrPng, independent)).toBe(0);

    const loaded = await PDFDocument.load(branded.pdf);
    expect(loaded.getSubject()).toBe("https://bukay.test/ada-salon");
    expect(new URL(loaded.getSubject() ?? "").pathname).toBe("/ada-salon");
    expect(Buffer.from(branded.pdf.subarray(0, 4)).toString()).toBe("%PDF");
    expect(loaded.getTitle()).toContain("Ada Salon");
  });

  it("rejects slugs that cannot be a public path", async () => {
    await expect(buildBrandedQrPdf({ tenantName: "Ada", slug: "../admin" })).rejects.toThrow(
      /slug is invalid/
    );
  });

  it("sends the PDF file to the owner over WhatsApp", async () => {
    const provider = new FakeWhatsAppProvider();
    const result = await sendQrPdfToOwner({
      tenantName: "Ada Salon",
      slug: "ada-salon",
      ownerPhone: "+2348011111111",
      provider,
      baseUrl: "https://bukay.test",
    });

    expect(result.httpStatus).toBe(200);
    expect(result.to).toBe("+2348011111111");
    const message = provider.lastTo("+2348011111111");
    expect(message?.content.kind).toBe("document");
    if (message?.content.kind !== "document") {
      throw new Error("expected a document message");
    }
    expect(message.content.filename).toBe("ada-salon-booking-qr.pdf");
    expect(message.content.mimeType).toBe("application/pdf");
    expect(message.content.caption).toContain("/ada-salon");
    expect(message.content.link).toBe("https://bukay.test/api/qr/ada-salon");

    const pdf = Buffer.from(message.content.dataBase64 ?? "", "base64");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    const loaded = await PDFDocument.load(pdf);
    expect(new URL(loaded.getSubject() ?? "").pathname).toBe("/ada-salon");
  });
});
