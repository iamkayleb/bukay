import { describe, expect, it } from "vitest";

import type {
  SendWhatsAppTemplateInput,
  WhatsAppProvider,
  WhatsAppSendResult,
} from "@/app/lib/whatsapp/provider";
import { isWhatsAppProviderError, WhatsAppProviderError } from "@/app/lib/whatsapp/provider";

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

  it("exposes retry details without exposing provider response objects", () => {
    const cause = new Error("gateway timeout");
    const error = new WhatsAppProviderError("meta", "Meta Cloud API timed out", {
      status: 504,
      retryable: true,
      cause,
    });

    expect(error).toMatchObject({
      name: "WhatsAppProviderError",
      provider: "meta",
      status: 504,
      retryable: true,
      cause,
    });
    expect(isWhatsAppProviderError(error)).toBe(true);
  });

  it("does not mistake unrelated failures for provider errors", () => {
    expect(isWhatsAppProviderError(new Error("network failure"))).toBe(false);
    expect(
      isWhatsAppProviderError({
        name: "WhatsAppProviderError",
        provider: "meta",
        retryable: "yes",
      })
    ).toBe(false);
  });
});
