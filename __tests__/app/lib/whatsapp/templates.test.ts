import { describe, it, expect } from "vitest";
import {
  WHATSAPP_TEMPLATES,
  findWhatsAppTemplateByName,
  getWhatsAppTemplate,
  listWhatsAppTemplates,
} from "@/app/lib/whatsapp/templates";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("WhatsApp template registry", () => {
  it("exposes the booking lifecycle and greeting templates", () => {
    expect(Object.keys(WHATSAPP_TEMPLATES).sort()).toEqual(
      [
        "booking_cancelled",
        "booking_confirmed",
        "booking_created",
        "booking_reminder",
        "booking_rescheduled",
        "greeting",
      ].sort()
    );
    expect(getWhatsAppTemplate("greeting").name).toBe("greeting");
    expect(findWhatsAppTemplateByName("booking_confirmed")?.category).toBe("UTILITY");
    expect(listWhatsAppTemplates()).toHaveLength(6);
  });

  it("documents every template in docs/WHATSAPP_TEMPLATES.md", () => {
    const docs = readFileSync(resolve("docs/WHATSAPP_TEMPLATES.md"), "utf8");
    for (const template of listWhatsAppTemplates()) {
      expect(docs).toContain(template.name);
      expect(docs).toContain(template.bodyExample);
      for (const placeholder of template.bodyPlaceholders) {
        expect(docs).toContain(placeholder);
      }
    }
  });
});
