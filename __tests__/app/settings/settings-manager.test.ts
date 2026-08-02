import { describe, expect, it } from "vitest";

import {
  settingsToForm,
  validateSettingsForm,
  type SettingsFormState,
} from "@/app/(app)/settings/settings-manager";

const validForm: SettingsFormState = {
  name: "Bukay Demo Salon",
  slug: "bukay-demo",
  brandColor: "#10b981",
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
});
