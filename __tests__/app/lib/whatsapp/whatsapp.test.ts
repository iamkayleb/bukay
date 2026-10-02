import { describe, it, expect, vi } from "vitest";
import { MetaWhatsAppProvider } from "@/app/lib/whatsapp/meta";
import { FakeWhatsAppProvider } from "@/app/lib/whatsapp/fake";
import { WhatsAppProvider, WhatsAppProviderError } from "@/app/lib/whatsapp/provider";
import { WHATSAPP_TEMPLATES } from "@/app/lib/whatsapp/templates";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const params = { code: "123456" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function sendOtp(provider: WhatsAppProvider) {
  return provider.sendTemplate({ to: "+2348012345678", template: "otp_code", params });
}

describe("MetaWhatsAppProvider", () => {
  it("requires credentials", () => {
    expect(() => new MetaWhatsAppProvider({ accessToken: "", phoneNumberId: "1" })).toThrow(
      /accessToken/
    );
    expect(() => new MetaWhatsAppProvider({ accessToken: "t", phoneNumberId: "" })).toThrow(
      /phoneNumberId/
    );
  });

  it("sandbox send returns 200 with a message id", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({ messages: [{ id: "wamid.abc" }] })
    );
    const provider = new MetaWhatsAppProvider({
      accessToken: "tok",
      phoneNumberId: "555",
      baseUrl: "https://sandbox.example.com/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await sendOtp(provider);

    expect(result).toEqual({
      id: "wamid.abc",
      provider: "meta",
      to: "+2348012345678",
      status: 200,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://sandbox.example.com/v20.0/555/messages");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const body = JSON.parse(init?.body as string);
    expect(body.to).toBe("2348012345678");
    expect(body.template.name).toBe("otp_code");
    expect(body.template.components[0].parameters).toEqual([{ type: "text", text: "123456" }]);
  });

  it("surfaces API errors with status", async () => {
    const provider = new MetaWhatsAppProvider({
      accessToken: "t",
      phoneNumberId: "1",
      fetchImpl: (async () =>
        jsonResponse({ error: { message: "bad token" } }, 401)) as unknown as typeof fetch,
    });
    await expect(sendOtp(provider)).rejects.toMatchObject({ status: 401, message: "bad token" });
  });

  it("rejects missing params and a response without an id", async () => {
    const provider = new MetaWhatsAppProvider({
      accessToken: "t",
      phoneNumberId: "1",
      fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch,
    });
    await expect(
      provider.sendTemplate({ to: "+1", template: "otp_code", params: {} })
    ).rejects.toThrow(/missing param/);
    await expect(sendOtp(provider)).rejects.toThrow(/missing message id/);
  });
});

describe("FakeWhatsAppProvider", () => {
  it("substitutes for the adapter and records sends", async () => {
    const fake = new FakeWhatsAppProvider();
    const provider: WhatsAppProvider = fake;
    const result = await sendOtp(provider);
    expect(result).toMatchObject({ id: "fake-wa-1", status: 200 });
    expect(fake.lastTo("+2348012345678")?.params).toEqual(params);
    fake.reset();
    expect(fake.outbox).toHaveLength(0);
  });

  it("validates like the live adapter", async () => {
    const fake = new FakeWhatsAppProvider();
    await expect(
      fake.sendTemplate({ to: "+1", template: "nope" as never, params: {} })
    ).rejects.toBeInstanceOf(WhatsAppProviderError);
    await expect(fake.sendTemplate({ to: "+1", template: "otp_code", params: {} })).rejects.toThrow(
      /missing param/
    );
  });
});

describe("template docs", () => {
  it("documents every template in the registry", () => {
    const doc = readFileSync(join(process.cwd(), "docs/WHATSAPP_TEMPLATES.md"), "utf8");
    for (const t of Object.values(WHATSAPP_TEMPLATES)) {
      expect(doc).toContain(`\`${t.name}\``);
      for (const p of t.params) expect(doc).toContain(`\`${p}\``);
    }
  });
});
