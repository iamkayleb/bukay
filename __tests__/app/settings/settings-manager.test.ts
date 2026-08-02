import { describe, expect, it } from "vitest";

import {
  getBrandContrastMessage,
  settingsToForm,
  validateSettingsForm,
  type SettingsFormState,
} from "@/app/(app)/settings/settings-manager";
import { getBrandColorContrastRatio } from "@/app/lib/settings/schemas";

const validForm: SettingsFormState = {
  name: "Bukay Demo Salon",
  slug: "bukay-demo",
  brandColor: "#047857",
  logoUrl: "https://example.com/logo.png",
  cancellationPolicy: "Cancel with 24 hours notice.",
};

describe("settings manager helpers", () => {
  it("maps persisted tenant settings into editable form state", () => {
    expect(
      settingsToForm({
        name: "Fresh Cuts",
        slug: "fresh-cuts",
        brandColor: "#2563eb",
        logoUrl: null,
        cancellationPolicy: null,
        publicUrl: "https://fresh-cuts.bukay.app",
      })
    ).toEqual({
      name: "Fresh Cuts",
      slug: "fresh-cuts",
      brandColor: "#2563eb",
      logoUrl: "",
      cancellationPolicy: "",
    });
  });

  it("accepts valid settings form values", () => {
    expect(validateSettingsForm(validForm)).toEqual({});
  });

  it("validates brand color independently from the browser color input", () => {
    expect(validateSettingsForm({ ...validForm, brandColor: "#12345" })).toEqual({
      brandColor: "Brand color must be a 6-digit hex color",
    });
  });

  it("rejects brand colors that fail white text contrast", () => {
    expect(validateSettingsForm({ ...validForm, brandColor: "#10b981" })).toEqual({
      brandColor: "Brand color must have at least 4.5:1 contrast with white text",
    });
  });

  it("computes and formats the displayed brand color contrast result", () => {
    expect(getBrandColorContrastRatio("#047857")).toBeGreaterThanOrEqual(4.5);
    expect(getBrandContrastMessage(getBrandColorContrastRatio("#047857"))).toContain("passes");
    expect(getBrandContrastMessage(getBrandColorContrastRatio("#10b981"))).toContain("needs 4.5:1");
    expect(getBrandContrastMessage(null)).toBe("White text contrast: enter a 6-digit hex color");
  });
});
