import { describe, expect, it, vi } from "vitest";

import { MetaWhatsAppProvider } from "@/app/lib/whatsapp/meta";

describe("MetaWhatsAppProvider", () => {
  it("sends an approved template and returns Meta's message id", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.meta-1" }] }), { status: 200 })
      );
    const provider = new MetaWhatsAppProvider({
      accessToken: "test-access-token",
      phoneNumberId: "123456",
      fetchImpl,
    });

    await expect(
      provider.sendTemplate({
        to: "+2348012345678",
        template: "booking_confirmation",
        language: "en_US",
        parameters: ["Ada", "10:00"],
      })
    ).resolves.toEqual({ id: "wamid.meta-1", provider: "meta", to: "+2348012345678" });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://graph.facebook.com/v21.0/123456/messages",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer test-access-token" }),
      })
    );
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body)).toEqual({
      messaging_product: "whatsapp",
      to: "2348012345678",
      type: "template",
      template: {
        name: "booking_confirmation",
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Ada" },
              { type: "text", text: "10:00" },
            ],
          },
        ],
      },
    });
  });

  it("marks rate limits retryable without exposing an unsuccessful response body", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 })
      );
    const provider = new MetaWhatsAppProvider({
      accessToken: "test-access-token",
      phoneNumberId: "123456",
      fetchImpl,
    });

    await expect(
      provider.sendTemplate({
        to: "+2348012345678",
        template: "booking_confirmation",
        parameters: [],
      })
    ).rejects.toMatchObject({ provider: "meta", status: 429, retryable: true });
  });
});
