import { afterEach, describe, expect, it } from "vitest";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import {
  __resetWhatsAppProviderForTests,
  getWhatsAppProvider,
  setWhatsAppProviderForTests,
} from "@/app/lib/whatsapp/resolve-provider";
import type { WhatsAppProvider } from "@/app/lib/whatsapp/provider";

describe("getWhatsAppProvider", () => {
  afterEach(() => {
    __resetWhatsAppProviderForTests();
    delete process.env.WHATSAPP_PROVIDER;
  });

  it("defaults to FakeWhatsAppProvider so tests never need Meta", async () => {
    const provider = getWhatsAppProvider();
    expect(provider).toBeInstanceOf(FakeWhatsAppProvider);
    expect(provider.name).toBe("fake");

    const result = await provider.send({
      to: "+2348012345678",
      content: { kind: "text", body: "hello" },
    });
    expect(result.httpStatus).toBe(200);
    expect(result.id).toMatch(/^wamid\./);
  });

  it("lets FakeWhatsAppProvider substitute via setWhatsAppProviderForTests", async () => {
    const fake = new FakeWhatsAppProvider();
    setWhatsAppProviderForTests(fake);

    const provider: WhatsAppProvider = getWhatsAppProvider();
    expect(provider).toBe(fake);

    const result = await provider.send({
      to: "+2348012345678",
      content: {
        kind: "template",
        name: "greeting",
        language: "en",
        bodyParameters: ["Ada"],
      },
    });
    expect(result.httpStatus).toBe(200);
    expect(result.id).toBe("wamid.fake_1");
    expect(fake.outbox).toHaveLength(1);
  });
});
