"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  BRAND_COLOR_CONTRAST_TARGET,
  DEFAULT_BRAND_COLOR,
  getBrandColorContrastRatio,
  hasBrandColorContrast,
} from "@/app/lib/settings/schemas";

type Settings = {
  name: string;
  slug: string;
  brandColor: string;
  logoUrl: string | null;
  cancellationPolicy: string | null;
  publicUrl: string;
};

export type SettingsFormState = {
  name: string;
  slug: string;
  brandColor: string;
  logoUrl: string;
  cancellationPolicy: string;
};

export type SettingsFieldErrors = Partial<Record<keyof SettingsFormState | "_form", string>>;

type ApiValidationError = {
  ok: false;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
};

const emptyForm: SettingsFormState = {
  name: "",
  slug: "",
  brandColor: DEFAULT_BRAND_COLOR,
  logoUrl: "",
  cancellationPolicy: "",
};

export function settingsToForm(settings: Settings): SettingsFormState {
  return {
    name: settings.name,
    slug: settings.slug,
    brandColor: settings.brandColor,
    logoUrl: settings.logoUrl ?? "",
    cancellationPolicy: settings.cancellationPolicy ?? "",
  };
}

export function validateSettingsForm(form: SettingsFormState): SettingsFieldErrors {
  const errors: SettingsFieldErrors = {};

  if (!form.name.trim()) {
    errors.name = "Business name is required";
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) {
    errors.slug = "Slug can use lowercase letters, numbers, and hyphens";
  }

  if (!/^#[0-9a-fA-F]{6}$/.test(form.brandColor.trim())) {
    errors.brandColor = "Brand color must be a 6-digit hex color";
  } else if (!hasBrandColorContrast(form.brandColor)) {
    errors.brandColor = `Brand color must have at least ${BRAND_COLOR_CONTRAST_TARGET}:1 contrast with white text`;
  }

  return errors;
}

function hasErrors(errors: SettingsFieldErrors) {
  return Object.keys(errors).length > 0;
}

function firstError(errors: string[] | undefined) {
  return errors?.[0];
}

function mapApiErrors(error: ApiValidationError): SettingsFieldErrors {
  const fieldErrors = error.fieldErrors ?? {};

  return {
    name: firstError(fieldErrors.name),
    slug: firstError(fieldErrors.slug),
    brandColor: firstError(fieldErrors.brandColor),
    logoUrl: firstError(fieldErrors.logoUrl),
    cancellationPolicy: firstError(fieldErrors.cancellationPolicy),
    _form: firstError(error.formErrors) ?? error.error,
  };
}

function buildPayload(form: SettingsFormState) {
  return {
    name: form.name.trim(),
    slug: form.slug.trim(),
    brandColor: form.brandColor.trim(),
    logoUrl: form.logoUrl.trim() || null,
    cancellationPolicy: form.cancellationPolicy.trim() || null,
  };
}

export function getBrandContrastMessage(ratio: number | null) {
  if (ratio === null) {
    return "White text contrast: enter a 6-digit hex color";
  }

  const formattedRatio = ratio.toFixed(2);

  return `White text contrast: ${formattedRatio}:1 ${
    ratio >= BRAND_COLOR_CONTRAST_TARGET ? "passes" : "needs 4.5:1"
  }`;
}

export function SettingsManager() {
  const [form, setForm] = useState<SettingsFormState>(emptyForm);
  const [errors, setErrors] = useState<SettingsFieldErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const publicUrl = useMemo(() => {
    const slug = form.slug.trim() || "your-business";
    return `https://${slug}.bukay.app`;
  }, [form.slug]);
  const brandContrastRatio = useMemo(
    () => getBrandColorContrastRatio(form.brandColor),
    [form.brandColor]
  );
  const brandContrastPasses =
    brandContrastRatio !== null && brandContrastRatio >= BRAND_COLOR_CONTRAST_TARGET;
  const previewBrandColor =
    /^#[0-9a-fA-F]{6}$/.test(form.brandColor) && brandContrastPasses
      ? form.brandColor
      : DEFAULT_BRAND_COLOR;

  async function loadSettings() {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", { headers: { Accept: "application/json" } });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to load settings");
      }

      setForm(settingsToForm(data.settings));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load settings");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadSettings();
  }, []);

  function updateField(field: keyof SettingsFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined, _form: undefined }));
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const nextErrors = validateSettingsForm(form);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      const response = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (data.error === "validation_failed") {
          setErrors(mapApiErrors(data));
          return;
        }

        throw new Error(data.error ?? "Unable to save settings");
      }

      setForm(settingsToForm(data.settings));
      setNotice("Settings saved.");
    } catch (error) {
      setErrors({
        _form: error instanceof Error ? error.message : "Unable to save settings",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <form className="space-y-6" onSubmit={(event) => void saveSettings(event)}>
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
              Settings
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Business profile</h1>
          </div>

          {notice ? (
            <p className="rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
              {notice}
            </p>
          ) : null}

          {errors._form ? (
            <p className="rounded-md border border-red-900/70 bg-red-950/50 px-4 py-3 text-sm text-red-200">
              {errors._form}
            </p>
          ) : null}

          <fieldset
            className="space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-5 disabled:opacity-70"
            disabled={isLoading || isSaving}
          >
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Business name</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
              />
              {errors.name ? (
                <span className="mt-1 block text-xs text-red-300">{errors.name}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Public slug</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                value={form.slug}
                onChange={(event) => updateField("slug", event.target.value)}
              />
              <span className="mt-1 block break-all text-xs text-slate-400">{publicUrl}</span>
              {errors.slug ? (
                <span className="mt-1 block text-xs text-red-300">{errors.slug}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Brand color</span>
              <div className="mt-1 flex items-center gap-3">
                <input
                  aria-label="Brand color picker"
                  className="h-10 w-12 shrink-0 cursor-pointer rounded-md border border-slate-700 bg-slate-950 p-1"
                  type="color"
                  value={
                    /^#[0-9a-fA-F]{6}$/.test(form.brandColor)
                      ? form.brandColor
                      : DEFAULT_BRAND_COLOR
                  }
                  onChange={(event) => updateField("brandColor", event.target.value)}
                />
                <input
                  className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  value={form.brandColor}
                  onChange={(event) => updateField("brandColor", event.target.value)}
                />
              </div>
              {errors.brandColor ? (
                <span className="mt-1 block text-xs text-red-300">{errors.brandColor}</span>
              ) : null}
              <span
                className={`mt-1 block text-xs ${
                  brandContrastPasses ? "text-emerald-300" : "text-amber-300"
                }`}
              >
                {getBrandContrastMessage(brandContrastRatio)}
              </span>
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Logo URL</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                placeholder="https://example.com/logo.png"
                value={form.logoUrl}
                onChange={(event) => updateField("logoUrl", event.target.value)}
              />
              {errors.logoUrl ? (
                <span className="mt-1 block text-xs text-red-300">{errors.logoUrl}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Cancellation policy</span>
              <textarea
                className="mt-1 min-h-28 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                value={form.cancellationPolicy}
                onChange={(event) => updateField("cancellationPolicy", event.target.value)}
              />
              {errors.cancellationPolicy ? (
                <span className="mt-1 block text-xs text-red-300">{errors.cancellationPolicy}</span>
              ) : null}
            </label>
          </fieldset>

          <button
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading || isSaving}
            type="submit"
          >
            {isSaving ? "Saving..." : "Save settings"}
          </button>
        </form>

        <aside className="h-fit rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Booking page preview</h2>
          <div className="mt-5 overflow-hidden rounded-lg border border-slate-800 bg-white text-slate-950">
            <div className="p-5" style={{ backgroundColor: previewBrandColor }}>
              {form.logoUrl ? (
                <img
                  alt={`${form.name || "Business"} logo`}
                  className="h-12 max-w-44 rounded bg-white object-contain p-1"
                  src={form.logoUrl}
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded bg-white text-lg font-semibold">
                  {(form.name.trim()[0] ?? "B").toUpperCase()}
                </div>
              )}
            </div>
            <div className="space-y-3 p-5">
              <p className="text-xl font-semibold">{form.name || "Business name"}</p>
              <p className="break-all text-sm text-slate-600">{publicUrl}</p>
              <button
                className="rounded-md px-4 py-2 text-sm font-semibold text-white"
                style={{ backgroundColor: previewBrandColor }}
                type="button"
              >
                Book appointment
              </button>
              {form.cancellationPolicy.trim() ? (
                <p className="border-t border-slate-200 pt-3 text-sm text-slate-700">
                  {form.cancellationPolicy}
                </p>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
