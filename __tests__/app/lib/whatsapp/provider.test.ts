import { describe, expect, it } from "vitest";

import type {
  SendWhatsAppTemplateInput,
  WhatsAppProvider,
  WhatsAppSendResult,
} from "@/app/lib/whatsapp/provider";

describe("WhatsAppProvider", () => {
  it("requires an asynchronous template send operation", async () => {
    const provider: WhatsAppProvider = {
      name: "test",
      async sendTemplate(input: SendWhatsAppTemplateInput): Promise<WhatsAppSendResult> {
        return { id: "wamid.test-1", provider: this.name, to: input.to };
      },
    };

    await expect(
      provider.sendTemplate({
        to: "+2348012345678",
        template: "booking_confirmation",
        language: "en_US",
        parameters: ["Ada", "10:00"],
      })
    ).resolves.toEqual({
      id: "wamid.test-1",
      provider: "test",
      to: "+2348012345678",
    });
  });
});
