import { describe, expect, it } from "vitest";

import {
  buildSettingsPayload,
  settingsToForm,
  slugifyBusinessName,
  validateSettingsForm,
  type Settings,
  type SettingsFormState,
} from "@/app/(app)/settings/settings-manager";

const validForm: SettingsFormState = {
  name: "Kay Salon",
  slug: "kay-salon",
  timezone: "Africa/Lagos",
  currency: "NGN",
  cancellationPolicy: "Cancel at least 24 hours before the appointment.",
};

const settings: Settings = {
  id: "tenant-1",
  name: "Bukay Demo Salon",
  slug: "demo",
  timezone: "Africa/Lagos",
  currency: "NGN",
  logoUrl: "https://cdn.example.com/logo.png",
  brandColor: "#10b981",
  cancellationPolicy: "",
};

describe("settings manager form helpers", () => {
  it("generates URL-safe slugs from business names", () => {
    expect(slugifyBusinessName(" Kay's Salon & Spa ")).toBe("kay-s-salon-spa");
    expect(slugifyBusinessName("Bukay---Demo")).toBe("bukay-demo");
  });

  it("returns inline errors for invalid settings values", () => {
    const errors = validateSettingsForm({
      name: " ",
      slug: "UPPER CASE",
      timezone: "",
      currency: "naira",
      cancellationPolicy: "x".repeat(2001),
    });

    expect(errors).toEqual({
      name: "Business name is required",
      slug: "Use 3-63 lowercase letters, numbers, and hyphens",
      timezone: "Timezone is required",
      currency: "Use a 3-letter currency code",
      cancellationPolicy: "Cancellation policy must be 2,000 characters or fewer",
    });
  });

  it("accepts valid settings form values", () => {
    expect(validateSettingsForm(validForm)).toEqual({});
  });

  it("maps loaded settings into editable form values", () => {
    expect(settingsToForm(settings)).toEqual({
      name: "Bukay Demo Salon",
      slug: "demo",
      timezone: "Africa/Lagos",
      currency: "NGN",
      cancellationPolicy: "",
    });
  });

  it("builds the API payload while preserving branding fields", () => {
    expect(buildSettingsPayload(validForm, settings)).toEqual({
      name: "Kay Salon",
      slug: "kay-salon",
      timezone: "Africa/Lagos",
      currency: "NGN",
      logoUrl: "https://cdn.example.com/logo.png",
      brandColor: "#10b981",
      cancellationPolicy: "Cancel at least 24 hours before the appointment.",
    });
  });
});
