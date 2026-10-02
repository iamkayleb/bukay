import { describe, expect, it } from "vitest";

import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import type { WhatsAppProvider } from "@/app/lib/whatsapp/provider";

async function sendBookingConfirmation(provider: WhatsAppProvider) {
  return provider.sendTemplate({
    to: "+2348012345678",
    template: "booking_confirmation",
    parameters: ["Ada", "10:00"],
  });
}

describe("FakeWhatsAppProvider", () => {
  it("substitutes for the live provider through the WhatsApp port", async () => {
    const provider = new FakeWhatsAppProvider();

    await expect(sendBookingConfirmation(provider)).resolves.toEqual({
      id: "fake-wa-1",
      provider: "fake",
      to: "+2348012345678",
    });
    expect(provider.outbox).toEqual([
      expect.objectContaining({
        id: "fake-wa-1",
        to: "+2348012345678",
        template: "booking_confirmation",
        parameters: ["Ada", "10:00"],
      }),
    ]);
  });

  it("records an independent copy of template parameters and can reset its outbox", async () => {
    const provider = new FakeWhatsAppProvider();
    const parameters = ["Ada"];

    await provider.sendTemplate({ to: "+2348012345678", template: "reminder", parameters });
    parameters[0] = "Changed";

    expect(provider.lastTo("+2348012345678")?.parameters).toEqual(["Ada"]);
    provider.reset();
    expect(provider.outbox).toEqual([]);
  });
});
