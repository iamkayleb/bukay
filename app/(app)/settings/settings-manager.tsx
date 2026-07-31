"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type Settings = {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  logoUrl: string | null;
  brandColor: string;
  cancellationPolicy: string;
};

export type SettingsFormState = {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  cancellationPolicy: string;
};

export type SettingsFieldErrors = Partial<Record<keyof SettingsFormState | "_form", string>>;

type ApiValidationError = {
  ok: false;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
};

const defaultForm: SettingsFormState = {
  name: "",
  slug: "",
  timezone: "Africa/Lagos",
  currency: "NGN",
  cancellationPolicy: "",
};

const timezoneOptions = ["Africa/Lagos", "UTC", "Europe/London", "America/New_York"];
const currencyOptions = ["NGN", "USD", "GBP", "EUR"];

export function slugifyBusinessName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 63);
}

export function validateSettingsForm(form: SettingsFormState): SettingsFieldErrors {
  const errors: SettingsFieldErrors = {};
  const name = form.name.trim();
  const slug = form.slug.trim();
  const currency = form.currency.trim();

  if (!name) {
    errors.name = "Business name is required";
  }

  if (!/^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(slug)) {
    errors.slug = "Use 3-63 lowercase letters, numbers, and hyphens";
  }

  if (!form.timezone.trim()) {
    errors.timezone = "Timezone is required";
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    errors.currency = "Use a 3-letter currency code";
  }

  if (form.cancellationPolicy.length > 2000) {
    errors.cancellationPolicy = "Cancellation policy must be 2,000 characters or fewer";
  }

  return errors;
}

export function settingsToForm(settings: Settings): SettingsFormState {
  return {
    name: settings.name,
    slug: settings.slug,
    timezone: settings.timezone || "Africa/Lagos",
    currency: settings.currency || "NGN",
    cancellationPolicy: settings.cancellationPolicy ?? "",
  };
}

export function buildSettingsPayload(form: SettingsFormState, settings: Settings | null) {
  return {
    name: form.name.trim(),
    slug: form.slug.trim().toLowerCase(),
    timezone: form.timezone.trim() || "Africa/Lagos",
    currency: form.currency.trim().toUpperCase() || "NGN",
    logoUrl: settings?.logoUrl ?? "",
    brandColor: settings?.brandColor ?? "#10b981",
    cancellationPolicy: form.cancellationPolicy.trim(),
  };
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
    timezone: firstError(fieldErrors.timezone),
    currency: firstError(fieldErrors.currency),
    cancellationPolicy: firstError(fieldErrors.cancellationPolicy),
    _form: firstError(error.formErrors) ?? error.error,
  };
}

function publicUrlForSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  return normalized ? `https://${normalized}.bukay.app` : "https://your-slug.bukay.app";
}

export function SettingsManager() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<SettingsFormState>(defaultForm);
  const [errors, setErrors] = useState<SettingsFieldErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const publicUrl = useMemo(() => publicUrlForSlug(form.slug), [form.slug]);

  async function loadSettings() {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/settings", { headers: { Accept: "application/json" } });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to load settings");
      }

      setSettings(data.settings);
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
        body: JSON.stringify(buildSettingsPayload(form, settings)),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (data.error === "validation_failed") {
          setErrors(mapApiErrors(data));
          return;
        }

        if (data.error === "slug_unavailable") {
          setErrors({ slug: "That public URL is already taken" });
          return;
        }

        throw new Error(data.error ?? "Unable to save settings");
      }

      setSettings(data.settings);
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
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <form
          className="rounded-lg border border-slate-800 bg-slate-900 p-5"
          onSubmit={(event) => void saveSettings(event)}
        >
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
              Settings
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Business profile</h1>
          </div>

          {notice ? (
            <p className="mt-5 rounded-md border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200">
              {notice}
            </p>
          ) : null}

          {errors._form ? (
            <p className="mt-5 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {errors._form}
            </p>
          ) : null}

          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-200">Business name</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                disabled={isLoading}
                value={form.name}
                onChange={(event) => {
                  const name = event.target.value;
                  setForm({
                    ...form,
                    name,
                    slug: form.slug ? form.slug : slugifyBusinessName(name),
                  });
                }}
              />
              {errors.name ? (
                <span className="mt-1 block text-xs text-red-300">{errors.name}</span>
              ) : null}
            </label>

            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-200">Public URL slug</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                disabled={isLoading}
                value={form.slug}
                onChange={(event) =>
                  setForm({ ...form, slug: slugifyBusinessName(event.target.value) })
                }
              />
              <span className="mt-1 block text-xs text-slate-400">{publicUrl}</span>
              {errors.slug ? (
                <span className="mt-1 block text-xs text-red-300">{errors.slug}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Timezone</span>
              <select
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                disabled={isLoading}
                value={form.timezone}
                onChange={(event) => setForm({ ...form, timezone: event.target.value })}
              >
                {timezoneOptions.map((timezone) => (
                  <option key={timezone} value={timezone}>
                    {timezone}
                  </option>
                ))}
              </select>
              {errors.timezone ? (
                <span className="mt-1 block text-xs text-red-300">{errors.timezone}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Currency</span>
              <select
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                disabled={isLoading}
                value={form.currency}
                onChange={(event) => setForm({ ...form, currency: event.target.value })}
              >
                {currencyOptions.map((currency) => (
                  <option key={currency} value={currency}>
                    {currency}
                  </option>
                ))}
              </select>
              {errors.currency ? (
                <span className="mt-1 block text-xs text-red-300">{errors.currency}</span>
              ) : null}
            </label>

            <label className="block sm:col-span-2">
              <span className="text-sm font-medium text-slate-200">Cancellation policy</span>
              <textarea
                className="mt-1 min-h-32 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                disabled={isLoading}
                value={form.cancellationPolicy}
                onChange={(event) => setForm({ ...form, cancellationPolicy: event.target.value })}
              />
              {errors.cancellationPolicy ? (
                <span className="mt-1 block text-xs text-red-300">{errors.cancellationPolicy}</span>
              ) : null}
            </label>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || isSaving}
              type="submit"
            >
              {isSaving ? "Saving..." : "Save settings"}
            </button>
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isLoading || !settings}
              type="button"
              onClick={() => settings && setForm(settingsToForm(settings))}
            >
              Reset
            </button>
          </div>
        </form>

        <aside className="h-fit rounded-lg border border-slate-800 bg-slate-900 p-5">
          <h2 className="text-lg font-semibold text-white">Public preview</h2>
          <div className="mt-5 rounded-md border border-slate-800 bg-slate-950 p-4">
            {settings?.logoUrl ? (
              <img
                alt=""
                className="mb-4 h-12 w-12 rounded-md object-cover"
                src={settings.logoUrl}
              />
            ) : (
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-emerald-500 text-lg font-semibold text-slate-950">
                {(form.name.trim()[0] ?? "B").toUpperCase()}
              </div>
            )}
            <p className="text-base font-semibold text-white">
              {form.name.trim() || "Business name"}
            </p>
            <p className="mt-1 break-all text-sm text-slate-400">{publicUrl}</p>
            <dl className="mt-4 grid gap-3 text-sm">
              <div>
                <dt className="text-slate-500">Timezone</dt>
                <dd className="text-slate-200">{form.timezone || "Africa/Lagos"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Currency</dt>
                <dd className="text-slate-200">{form.currency || "NGN"}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>
    </main>
  );
}
