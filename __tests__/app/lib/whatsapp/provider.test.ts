import { describe, it, expect } from "vitest";

import {
  WhatsAppProviderError,
  assertWhatsAppSendInput,
  redactSecrets,
  type WhatsAppProvider,
  type WhatsAppSendInput,
} from "@/app/lib/whatsapp/provider";

describe("WhatsAppProvider port", () => {
  it("exposes WhatsAppProviderError with provider and optional status", () => {
    const err = new WhatsAppProviderError("fake", "boom", { status: 502 });
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("WhatsAppProviderError");
    expect(err.provider).toBe("fake");
    expect(err.message).toBe("boom");
    expect(err.status).toBe(502);
  });

  it("redacts secret values of sufficient length from log strings", () => {
    const secret = "EAAabcdefghijklmnopqrstuvwxyz";
    const message = `Authorization Bearer ${secret} failed`;
    expect(redactSecrets(message, [secret])).toBe("Authorization Bearer [REDACTED] failed");
    expect(redactSecrets(message, [secret])).not.toContain(secret);
  });

  it("ignores short placeholders so redaction cannot wipe the message", () => {
    expect(redactSecrets("status=ok", ["tok"])).toBe("status=ok");
    expect(redactSecrets("status=ok", [""])).toBe("status=ok");
  });

  it("assertWhatsAppSendInput rejects missing recipient and content fields", () => {
    const text: WhatsAppSendInput = {
      to: "+2348012345678",
      content: { kind: "text", body: "hello" },
    };
    expect(() => assertWhatsAppSendInput("contract", text)).not.toThrow();

    expect(() => assertWhatsAppSendInput("contract", { ...text, to: "" })).toThrow(
      /'to' is required/
    );
    expect(() =>
      assertWhatsAppSendInput("contract", {
        to: "+2348012345678",
        content: { kind: "text", body: "" },
      })
    ).toThrow(/text body is required/);
    expect(() =>
      assertWhatsAppSendInput("contract", {
        to: "+2348012345678",
        content: { kind: "template", name: "", language: "en" },
      })
    ).toThrow(/template name is required/);
    expect(() =>
      assertWhatsAppSendInput("contract", {
        to: "+2348012345678",
        content: { kind: "template", name: "greeting", language: "" },
      })
    ).toThrow(/template language is required/);
  });

  it("accepts a structural WhatsAppProvider implementation", async () => {
    const input: WhatsAppSendInput = {
      to: "+2348012345678",
      content: {
        kind: "template",
        name: "greeting",
        language: "en",
        bodyParameters: ["Ada"],
      },
    };

    const provider: WhatsAppProvider = {
      name: "contract",
      async send(req) {
        assertWhatsAppSendInput(this.name, req);
        expect(req).toEqual(input);
        return {
          provider: this.name,
          id: "wamid.contract_1",
          to: req.to,
          httpStatus: 200,
        };
      },
    };

    const result = await provider.send(input);
    expect(result.httpStatus).toBe(200);
    expect(result.id).toMatch(/^wamid\./);
    expect(result.provider).toBe("contract");
  });
});
