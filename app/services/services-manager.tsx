"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  bufferMinutes: number;
  active: boolean;
};

export type ServiceFormState = {
  name: string;
  durationMinutes: string;
  priceNaira: string;
  bufferMinutes: string;
  active: boolean;
};

export type ServiceFieldErrors = Partial<Record<keyof ServiceFormState | "_form", string>>;

type ApiValidationError = {
  ok: false;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
};

const emptyForm: ServiceFormState = {
  name: "",
  durationMinutes: "60",
  priceNaira: "",
  bufferMinutes: "0",
  active: true,
};

export function koboToNairaInput(priceKobo: number) {
  return (priceKobo / 100).toFixed(2).replace(/\.00$/, "");
}

export function nairaInputToKobo(value: string) {
  const amount = Number(value.trim());
  if (!Number.isFinite(amount)) {
    return Number.NaN;
  }

  return Math.round(amount * 100);
}

export function validateServiceForm(form: ServiceFormState): ServiceFieldErrors {
  const errors: ServiceFieldErrors = {};
  const name = form.name.trim();
  const durationMinutes = Number(form.durationMinutes);
  const priceKobo = nairaInputToKobo(form.priceNaira);
  const bufferMinutes = Number(form.bufferMinutes);

  if (!name) {
    errors.name = "Name is required";
  }

  if (!Number.isInteger(durationMinutes) || durationMinutes < 1) {
    errors.durationMinutes = "Duration must be at least 1 minute";
  }

  if (!Number.isInteger(priceKobo) || priceKobo < 0) {
    errors.priceNaira = "Price cannot be negative";
  }

  if (!Number.isInteger(bufferMinutes) || bufferMinutes < 0) {
    errors.bufferMinutes = "Buffer cannot be negative";
  }

  return errors;
}

export function serviceToForm(service: Service): ServiceFormState {
  return {
    name: service.name,
    durationMinutes: String(service.durationMinutes),
    priceNaira: koboToNairaInput(service.priceKobo),
    bufferMinutes: String(service.bufferMinutes),
    active: service.active,
  };
}

function hasErrors(errors: ServiceFieldErrors) {
  return Object.keys(errors).length > 0;
}

function buildPayload(form: ServiceFormState) {
  return {
    name: form.name.trim(),
    durationMinutes: Number(form.durationMinutes),
    priceKobo: nairaInputToKobo(form.priceNaira),
    bufferMinutes: Number(form.bufferMinutes),
    active: form.active,
  };
}

function firstError(errors: string[] | undefined) {
  return errors?.[0];
}

function mapApiErrors(error: ApiValidationError): ServiceFieldErrors {
  const fieldErrors = error.fieldErrors ?? {};

  return {
    name: firstError(fieldErrors.name),
    durationMinutes: firstError(fieldErrors.durationMinutes),
    priceNaira: firstError(fieldErrors.priceKobo),
    bufferMinutes: firstError(fieldErrors.bufferMinutes),
    active: firstError(fieldErrors.active),
    _form: firstError(error.formErrors) ?? error.error,
  };
}

function formatNaira(priceKobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(priceKobo / 100);
}

export function ServicesManager() {
  const [services, setServices] = useState<Service[]>([]);
  const [form, setForm] = useState<ServiceFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<ServiceFieldErrors>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadServices() {
    setIsLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/services", { headers: { Accept: "application/json" } });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Unable to load services");
      }

      setServices(data.services);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Unable to load services");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadServices();
  }, []);

  const activeServices = useMemo(() => services.filter((service) => service.active), [services]);
  const archivedServices = useMemo(() => services.filter((service) => !service.active), [services]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setErrors({});
  }

  async function saveService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const nextErrors = validateServiceForm(form);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setIsSaving(true);
    setErrors({});

    try {
      const response = await fetch(editingId ? `/api/services/${editingId}` : "/api/services", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (data.error === "validation_failed") {
          setErrors(mapApiErrors(data));
          return;
        }

        throw new Error(data.error ?? "Unable to save service");
      }

      await loadServices();
      resetForm();
      setNotice(editingId ? "Service updated." : "Service created.");
    } catch (error) {
      setErrors({
        _form: error instanceof Error ? error.message : "Unable to save service",
      });
    } finally {
      setIsSaving(false);
    }
  }

  async function archiveService(service: Service) {
    setNotice(null);
    const response = await fetch(`/api/services/${service.id}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });
    const data = await response.json();

    if (!response.ok || !data.ok) {
      setNotice(data.error ?? "Unable to archive service");
      return;
    }

    await loadServices();
    if (editingId === service.id) {
      resetForm();
    }
  }

  function editService(service: Service) {
    setEditingId(service.id);
    setForm(serviceToForm(service));
    setErrors({});
    setNotice(null);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-5">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
                Services
              </p>
              <h1 className="mt-2 text-3xl font-semibold text-white">Manage service menu</h1>
            </div>
            <button
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-emerald-400"
              type="button"
              onClick={resetForm}
            >
              New service
            </button>
          </div>

          {notice ? (
            <p className="rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
              {notice}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-lg border border-slate-800">
            <div className="grid grid-cols-[1fr_92px_112px_100px] bg-slate-900 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span>Name</span>
              <span>Duration</span>
              <span>Price</span>
              <span>Status</span>
            </div>

            {isLoading ? (
              <p className="px-4 py-6 text-sm text-slate-400">Loading services...</p>
            ) : activeServices.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-400">No active services yet.</p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {activeServices.map((service) => (
                  <li
                    className="grid grid-cols-[1fr_92px_112px_100px] items-center gap-3 px-4 py-4 text-sm"
                    key={service.id}
                  >
                    <div>
                      <p className="font-medium text-white">{service.name}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {service.bufferMinutes} min buffer
                      </p>
                    </div>
                    <span className="text-slate-300">{service.durationMinutes} min</span>
                    <span className="text-slate-300">{formatNaira(service.priceKobo)}</span>
                    <div className="flex items-center gap-2">
                      <button
                        className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400"
                        type="button"
                        onClick={() => editService(service)}
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-red-400"
                        type="button"
                        onClick={() => void archiveService(service)}
                      >
                        Archive
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {archivedServices.length > 0 ? (
            <details className="rounded-lg border border-slate-800 bg-slate-900/40">
              <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-slate-200">
                Archived services ({archivedServices.length})
              </summary>
              <ul className="divide-y divide-slate-800">
                {archivedServices.map((service) => (
                  <li
                    className="flex items-center justify-between gap-3 px-4 py-3"
                    key={service.id}
                  >
                    <span className="text-sm text-slate-400">{service.name}</span>
                    <button
                      className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-100 hover:border-emerald-400"
                      type="button"
                      onClick={() => editService(service)}
                    >
                      Restore
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <form
          className="h-fit rounded-lg border border-slate-800 bg-slate-900 p-5"
          onSubmit={(event) => void saveService(event)}
        >
          <h2 className="text-lg font-semibold text-white">
            {editingId ? "Edit service" : "Create service"}
          </h2>

          {errors._form ? (
            <p className="mt-4 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
              {errors._form}
            </p>
          ) : null}

          <div className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-200">Name</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              {errors.name ? (
                <span className="mt-1 block text-xs text-red-300">{errors.name}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Duration minutes</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                min="1"
                type="number"
                value={form.durationMinutes}
                onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
              />
              {errors.durationMinutes ? (
                <span className="mt-1 block text-xs text-red-300">{errors.durationMinutes}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Price (NGN)</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                min="0"
                step="0.01"
                type="number"
                value={form.priceNaira}
                onChange={(event) => setForm({ ...form, priceNaira: event.target.value })}
              />
              {errors.priceNaira ? (
                <span className="mt-1 block text-xs text-red-300">{errors.priceNaira}</span>
              ) : null}
            </label>

            <label className="block">
              <span className="text-sm font-medium text-slate-200">Buffer minutes</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                min="0"
                type="number"
                value={form.bufferMinutes}
                onChange={(event) => setForm({ ...form, bufferMinutes: event.target.value })}
              />
              {errors.bufferMinutes ? (
                <span className="mt-1 block text-xs text-red-300">{errors.bufferMinutes}</span>
              ) : null}
            </label>

            <label className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <input
                checked={form.active}
                className="h-4 w-4 accent-emerald-500"
                type="checkbox"
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
              />
              Active
            </label>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving}
              type="submit"
            >
              {isSaving ? "Saving..." : editingId ? "Save changes" : "Create service"}
            </button>
            {editingId ? (
              <button
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500"
                type="button"
                onClick={resetForm}
              >
                Cancel
              </button>
            ) : null}
          </div>
        </form>
      </div>
    </main>
  );
}
