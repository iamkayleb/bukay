import { describe, it, expect } from "vitest";
import * as whatsapp from "@/app/lib/whatsapp";

describe("whatsapp barrel exports", () => {
  it("exports the provider port, adapters, templates, and helpers", () => {
    expect(typeof whatsapp.FakeWhatsAppProvider).toBe("function");
    expect(typeof whatsapp.MetaWhatsAppProvider).toBe("function");
    expect(typeof whatsapp.metaWhatsAppFromEnv).toBe("function");
    expect(typeof whatsapp.normalizeWhatsAppRecipient).toBe("function");
    expect(typeof whatsapp.assertWhatsAppSendInput).toBe("function");
    expect(typeof whatsapp.redactSecrets).toBe("function");
    expect(typeof whatsapp.WhatsAppProviderError).toBe("function");
    expect(typeof whatsapp.getWhatsAppTemplate).toBe("function");
    expect(typeof whatsapp.listWhatsAppTemplates).toBe("function");
    expect(typeof whatsapp.findWhatsAppTemplateByName).toBe("function");
    expect(typeof whatsapp.sendGreetingTemplate).toBe("function");
    expect(typeof whatsapp.normalizeWhatsAppNumber).toBe("function");
    expect(typeof whatsapp.canonicalCustomerPhone).toBe("function");
    expect(typeof whatsapp.resolveTenantByNumber).toBe("function");
    expect(whatsapp.WHATSAPP_TEMPLATES.greeting.name).toBe("greeting");
  });
});
