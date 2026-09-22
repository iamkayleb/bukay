import { describe, it, expect, vi } from "vitest";
import {
  MetaWhatsAppProvider,
  metaWhatsAppFromEnv,
  normalizeWhatsAppRecipient,
} from "@/app/lib/whatsapp/meta";
import { WhatsAppProviderError } from "@/app/lib/whatsapp/provider";

function jsonResponse(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("MetaWhatsAppProvider", () => {
  it("requires accessToken and phoneNumberId", () => {
    expect(() => new MetaWhatsAppProvider({ accessToken: "", phoneNumberId: "x" })).toThrow(
      /accessToken/
    );
    expect(() => new MetaWhatsAppProvider({ accessToken: "x", phoneNumberId: "" })).toThrow(
      /phoneNumberId/
    );
  });

  it("normalizeWhatsAppRecipient strips + and spaces", () => {
    expect(normalizeWhatsAppRecipient("+234 801 234 5678")).toBe("2348012345678");
  });

  it("sandbox template send returns HTTP 200 with a message id", async () => {
    const fetchImpl = vi.fn(async (_url: string, _init?: RequestInit) =>
      jsonResponse({
        messaging_product: "whatsapp",
        messages: [{ id: "wamid.HBgLMjM0ODAxMjM0NTY3OBUCABIYFjNBMD" }],
      })
    );
    const provider = new MetaWhatsAppProvider({
      accessToken: "EAA_sandbox_token_value",
      phoneNumberId: "1234567890",
      baseUrl: "https://graph.example.com",
      apiVersion: "v21.0",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const result = await provider.send({
      to: "+2348012345678",
      content: {
        kind: "template",
        name: "greeting",
        language: "en",
        bodyParameters: ["Ada"],
      },
    });

    // Acceptance: sandbox send returns HTTP 200 with a message id.
    expect(result.httpStatus).toBe(200);
    expect(result.id).toBeTruthy();
    expect(result.id).toMatch(/^wamid\./);
    expect(result.id).toBe("wamid.HBgLMjM0ODAxMjM0NTY3OBUCABIYFjNBMD");
    expect(result.provider).toBe("meta");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://graph.example.com/v21.0/1234567890/messages");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe(
      "Bearer EAA_sandbox_token_value"
    );
    const body = JSON.parse(init?.body as string);
    expect(body).toMatchObject({
      messaging_product: "whatsapp",
      to: "2348012345678",
      type: "template",
      template: {
        name: "greeting",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "Ada" }],
          },
        ],
      },
    });
  });

  it("POSTs text messages with a body", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ messages: [{ id: "wamid.text_1" }] }));
    const provider = new MetaWhatsAppProvider({
      accessToken: "EAA_sandbox_token_value",
      phoneNumberId: "99",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await provider.send({
      to: "2348000000001",
      content: { kind: "text", body: "hi" },
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body).toMatchObject({
      type: "text",
      text: { body: "hi", preview_url: false },
    });
  });

  it("throws WhatsAppProviderError on non-OK response", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { message: "Invalid parameter" } }, { status: 400 })
    );
    const provider = new MetaWhatsAppProvider({
      accessToken: "EAA_sandbox_token_value",
      phoneNumberId: "99",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.send({ to: "+234", content: { kind: "text", body: "hi" } })
    ).rejects.toMatchObject({
      name: "WhatsAppProviderError",
      message: "Invalid parameter",
      status: 400,
    });
  });

  it("wraps network errors as WhatsAppProviderError", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNRESET");
    });
    const provider = new MetaWhatsAppProvider({
      accessToken: "EAA_sandbox_token_value",
      phoneNumberId: "99",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.send({ to: "+234", content: { kind: "text", body: "hi" } })
    ).rejects.toBeInstanceOf(WhatsAppProviderError);
  });

  it("throws if Meta omits a message id", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ messages: [] }));
    const provider = new MetaWhatsAppProvider({
      accessToken: "EAA_sandbox_token_value",
      phoneNumberId: "99",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.send({ to: "+234", content: { kind: "text", body: "hi" } })
    ).rejects.toThrow(/message id/);
  });

  it("omits template components when bodyParameters are absent", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ messages: [{ id: "wamid.no_params" }] }));
    const provider = new MetaWhatsAppProvider({
      accessToken: "EAA_sandbox_token_value",
      phoneNumberId: "99",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await provider.send({
      to: "+2348012345678",
      content: { kind: "template", name: "greeting", language: "en" },
    });
    const body = JSON.parse(fetchImpl.mock.calls[0][1]?.body as string);
    expect(body.template.components).toBeUndefined();
  });

  it("throws WhatsAppProviderError on invalid JSON bodies", async () => {
    const fetchImpl = vi.fn(async () => new Response("not-json", { status: 200 }));
    const provider = new MetaWhatsAppProvider({
      accessToken: "EAA_sandbox_token_value",
      phoneNumberId: "99",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(
      provider.send({ to: "+234", content: { kind: "text", body: "hi" } })
    ).rejects.toMatchObject({
      name: "WhatsAppProviderError",
      message: "Invalid JSON from Meta WhatsApp Cloud API",
      status: 200,
    });
  });

  it("metaWhatsAppFromEnv reads WHATSAPP_* credentials", () => {
    const provider = metaWhatsAppFromEnv({
      WHATSAPP_ACCESS_TOKEN: "EAA_from_env_token",
      WHATSAPP_PHONE_NUMBER_ID: "pnid_1",
      WHATSAPP_API_VERSION: "v22.0",
      WHATSAPP_BASE_URL: "https://graph.env.test",
    });
    expect(provider.name).toBe("meta");
  });
});
