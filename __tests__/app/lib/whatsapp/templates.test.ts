import { describe, expect, it } from "vitest";

import {
  getWhatsAppTemplate,
  templateParameters,
  WHATSAPP_TEMPLATES,
} from "@/app/lib/whatsapp/templates";

describe("WhatsApp template registry", () => {
  it("contains uniquely named, approved-template metadata", () => {
    const templates = Object.entries(WHATSAPP_TEMPLATES);

    expect(templates).not.toHaveLength(0);
    expect(templates.map(([key]) => key)).toEqual(templates.map(([, template]) => template.name));
    expect(new Set(templates.map(([, template]) => template.name)).size).toBe(templates.length);
    for (const [, template] of templates) {
      expect(template.language).toBeTruthy();
      expect(template.description).toBeTruthy();
    }
  });

  it("looks up templates and orders named parameters for the provider", () => {
    const template = getWhatsAppTemplate("booking_confirmation");

    expect(template).toEqual(WHATSAPP_TEMPLATES.booking_confirmation);
    expect(
      templateParameters(template!, {
        businessName: "Bukay Studio",
        startsAt: "10:00",
        serviceName: "Haircut",
        customerName: "Ada",
      })
    ).toEqual(["Ada", "Haircut", "10:00", "Bukay Studio"]);
  });

  it("rejects unknown templates and missing placeholder values", () => {
    expect(getWhatsAppTemplate("unapproved_template")).toBeUndefined();
    expect(() => templateParameters(WHATSAPP_TEMPLATES.otp_code, {})).toThrow(
      "Template 'otp_code' is missing parameter 'code'"
    );
  });
});
