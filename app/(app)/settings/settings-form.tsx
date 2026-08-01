"use client";

import { ChangeEvent, useState } from "react";

export type SettingsFormState = {
  businessName: string;
  slug: string;
  logoUrl: string;
  brandColor: string;
  cancellationPolicy: string;
};

export const defaultSettingsForm: SettingsFormState = {
  businessName: "Bukay Studio",
  slug: "demo",
  logoUrl: "",
  brandColor: "#10b981",
  cancellationPolicy: "Clients can cancel or reschedule up to 24 hours before their appointment.",
};

function normalizeHexColor(value: string) {
  return value.trim().toUpperCase();
}

export function SettingsForm() {
  const [form, setForm] = useState<SettingsFormState>(defaultSettingsForm);

  function updateField(field: keyof SettingsFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateBrandColor(event: ChangeEvent<HTMLInputElement>) {
    updateField("brandColor", normalizeHexColor(event.target.value));
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-5">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
              Settings
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Business profile</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">
              Manage the public booking identity customers see before choosing a service.
            </p>
          </div>

          <form className="rounded-lg border border-slate-800 bg-slate-900 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-200">Business name</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  value={form.businessName}
                  onChange={(event) => updateField("businessName", event.target.value)}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Booking slug</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  value={form.slug}
                  onChange={(event) => updateField("slug", event.target.value)}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-200">Logo URL</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  placeholder="https://..."
                  value={form.logoUrl}
                  onChange={(event) => updateField("logoUrl", event.target.value)}
                />
              </label>

              <fieldset className="sm:col-span-2">
                <legend className="text-sm font-medium text-slate-200">Brand color</legend>
                <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-center">
                  <input
                    aria-label="Brand color"
                    className="h-11 w-20 cursor-pointer rounded-md border border-slate-700 bg-slate-950 p-1"
                    type="color"
                    value={form.brandColor}
                    onChange={updateBrandColor}
                  />
                  <input
                    aria-label="Brand color hex"
                    className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-medium uppercase text-white outline-none focus:border-emerald-400 sm:max-w-40"
                    maxLength={7}
                    pattern="^#[0-9A-Fa-f]{6}$"
                    value={form.brandColor}
                    onChange={updateBrandColor}
                  />
                </div>
              </fieldset>

              <label className="block sm:col-span-2">
                <span className="text-sm font-medium text-slate-200">Cancellation policy</span>
                <textarea
                  className="mt-1 min-h-28 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                  value={form.cancellationPolicy}
                  onChange={(event) => updateField("cancellationPolicy", event.target.value)}
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                className="rounded-md px-4 py-2 text-sm font-semibold text-slate-950"
                style={{ backgroundColor: form.brandColor }}
                type="button"
              >
                Save settings
              </button>
            </div>
          </form>
        </section>

        <aside className="h-fit rounded-lg border border-slate-800 bg-slate-900 p-5">
          <p className="text-sm font-medium text-slate-300">Public preview</p>
          <div className="mt-5 rounded-md border border-slate-800 bg-slate-950 p-4">
            <div className="flex items-center gap-3">
              <div
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-sm font-bold text-slate-950"
                style={{ backgroundColor: form.brandColor }}
              >
                {form.businessName.slice(0, 1).toUpperCase() || "B"}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{form.businessName}</h2>
                <p className="text-xs text-slate-400">https://{form.slug}.bukay.app</p>
              </div>
            </div>
            <button
              className="mt-5 w-full rounded-md px-4 py-2 text-sm font-semibold text-slate-950"
              style={{ backgroundColor: form.brandColor }}
              type="button"
            >
              Book appointment
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}
