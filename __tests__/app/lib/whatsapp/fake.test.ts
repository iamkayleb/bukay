import { describe, it, expect } from "vitest";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import {
  WhatsAppProviderError,
  type WhatsAppProvider,
  type WhatsAppSendInput,
} from "@/app/lib/whatsapp/provider";

describe("FakeWhatsAppProvider", () => {
  it("substitutes for WhatsAppProvider and records sandbox sends with HTTP 200", async () => {
    const fake = new FakeWhatsAppProvider();
    const provider: WhatsAppProvider = fake;

    const input: WhatsAppSendInput = {
      to: "+2348012345678",
      content: {
        kind: "template",
        name: "greeting",
        language: "en",
        bodyParameters: ["Ada"],
      },
    };

    const result = await provider.send(input);

    expect(result.httpStatus).toBe(200);
    expect(result.id).toBe("wamid.fake_1");
    expect(result.provider).toBe("fake");
    expect(fake.outbox).toHaveLength(1);
    expect(fake.outbox[0].content).toEqual(input.content);
  });

  it("returns the most recent message for a number via lastTo", async () => {
    const provider = new FakeWhatsAppProvider();
    await provider.send({
      to: "+2348000000001",
      content: { kind: "text", body: "older" },
    });
    await provider.send({
      to: "+2348000000002",
      content: { kind: "text", body: "other" },
    });
    await provider.send({
      to: "+2348000000001",
      content: { kind: "text", body: "newer" },
    });

    expect(provider.lastTo("+2348000000001")?.content).toEqual({
      kind: "text",
      body: "newer",
    });
    expect(provider.lastTo("+2348099999999")).toBeUndefined();
  });

  it("reset clears the outbox and id counter", async () => {
    const provider = new FakeWhatsAppProvider();
    await provider.send({ to: "+234800", content: { kind: "text", body: "x" } });
    provider.reset();
    expect(provider.outbox).toHaveLength(0);
    const next = await provider.send({
      to: "+234800",
      content: { kind: "text", body: "y" },
    });
    expect(next.id).toBe("wamid.fake_1");
  });

  it("can simulate a send failure for fallback tests", async () => {
    const provider = new FakeWhatsAppProvider();
    provider.nextError = new WhatsAppProviderError("fake", "simulated failure", {
      status: 500,
    });
    await expect(
      provider.send({ to: "+234800", content: { kind: "text", body: "x" } })
    ).rejects.toMatchObject({ status: 500 });
    expect(provider.outbox).toHaveLength(0);
  });
});
