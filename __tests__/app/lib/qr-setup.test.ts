import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  findUnique: vi.fn(),
}));

vi.mock("@/app/db/prisma", () => ({
  prisma: {
    tenant: {
      findUnique: state.findUnique,
    },
  },
}));

import { deliverQrPdfAfterSetup } from "@/app/lib/qr-setup";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";

beforeEach(() => {
  state.findUnique.mockReset();
});

describe("deliverQrPdfAfterSetup", () => {
  it("sends the booking QR file to the owner after setup", async () => {
    state.findUnique.mockResolvedValue({
      name: "Ada Salon",
      slug: "ada-salon",
      whatsappNumber: "2348011111111",
    });
    const provider = new FakeWhatsAppProvider();

    const result = await deliverQrPdfAfterSetup({
      slug: "ada-salon",
      provider,
      baseUrl: "https://bukay.test",
    });

    expect(state.findUnique).toHaveBeenCalledWith({
      where: { slug: "ada-salon" },
      select: { name: true, slug: true, whatsappNumber: true },
    });
    expect(result.httpStatus).toBe(200);
    expect(result.to).toBe("2348011111111");
    const message = provider.lastTo("2348011111111");
    expect(message?.content.kind).toBe("document");
    if (message?.content.kind !== "document") {
      throw new Error("expected a document message");
    }
    expect(message.content.filename).toBe("ada-salon-booking-qr.pdf");
    const pdf = Buffer.from(message.content.dataBase64 ?? "", "base64");
    expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("refuses to send when setup did not capture the owner WhatsApp number", async () => {
    state.findUnique.mockResolvedValue({
      name: "Ada Salon",
      slug: "ada-salon",
      whatsappNumber: null,
    });
    const provider = new FakeWhatsAppProvider();

    await expect(
      deliverQrPdfAfterSetup({ slug: "ada-salon", provider, baseUrl: "https://bukay.test" })
    ).rejects.toThrow(/owner WhatsApp number is not set/);
    expect(provider.outbox).toHaveLength(0);
  });
});
