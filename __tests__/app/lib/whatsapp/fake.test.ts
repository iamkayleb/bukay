import { describe, it, expect } from "vitest";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import {
  WhatsAppProviderError,
  type WhatsAppProvider,
  type WhatsAppSendInput,
  type WhatsAppTemplateContent,
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
    expect(result.to).toBe(input.to);
    expect(fake.outbox).toHaveLength(1);
    expect(fake.outbox[0].content).toEqual(input.content);
  });

  it("records text sandbox sends with HTTP 200 and a wamid id", async () => {
    const provider = new FakeWhatsAppProvider();
    const result = await provider.send({
      to: "+2348012345678",
      content: { kind: "text", body: "hello" },
    });
    expect(result.httpStatus).toBe(200);
    expect(result.id).toMatch(/^wamid\.fake_/);
    expect(provider.outbox[0].httpStatus).toBe(200);
  });

  it("clones template content so caller mutations do not alter the outbox", async () => {
    const provider = new FakeWhatsAppProvider();
    const content: WhatsAppTemplateContent = {
      kind: "template",
      name: "greeting",
      language: "en",
      bodyParameters: ["Ada"],
    };
    await provider.send({ to: "+2348012345678", content });
    content.bodyParameters![0] = "mutated";
    expect(provider.outbox[0].content).toEqual({
      kind: "template",
      name: "greeting",
      language: "en",
      bodyParameters: ["Ada"],
    });
  });

  it("rejects invalid send input with WhatsAppProviderError", async () => {
    const provider = new FakeWhatsAppProvider();
    await expect(
      provider.send({ to: "  ", content: { kind: "text", body: "hi" } })
    ).rejects.toBeInstanceOf(WhatsAppProviderError);
    await expect(
      provider.send({
        to: "+2348012345678",
        content: { kind: "template", name: "", language: "en" },
      })
    ).rejects.toThrow(/template name/);
    expect(provider.outbox).toHaveLength(0);
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
    expect(provider.messagesTo("+2348000000001").map((m) => m.content)).toEqual([
      { kind: "text", body: "older" },
      { kind: "text", body: "newer" },
    ]);
    expect(provider.messagesTo("+2348099999999")).toEqual([]);
  });

  it("honors nextHttpStatus once then resets to 200", async () => {
    const provider = new FakeWhatsAppProvider();
    provider.nextHttpStatus = 503;
    const failed = await provider.send({
      to: "+234800",
      content: { kind: "text", body: "retry-me" },
    });
    expect(failed.httpStatus).toBe(503);
    expect(provider.outbox[0].httpStatus).toBe(503);

    const recovered = await provider.send({
      to: "+234800",
      content: { kind: "text", body: "ok" },
    });
    expect(recovered.httpStatus).toBe(200);
    expect(provider.nextHttpStatus).toBe(200);
  });

  it("reset clears the outbox and id counter", async () => {
    const provider = new FakeWhatsAppProvider();
    await provider.send({ to: "+234800", content: { kind: "text", body: "x" } });
    provider.nextHttpStatus = 500;
    provider.nextError = new Error("should clear");
    provider.reset();
    expect(provider.outbox).toHaveLength(0);
    expect(provider.nextHttpStatus).toBe(200);
    expect(provider.nextError).toBeNull();
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
    expect(provider.nextError).toBeNull();
  });
});
