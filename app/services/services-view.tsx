"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  emptyForm,
  formFromService,
  formToPayload,
  formatKobo,
  type FieldErrors,
  type ServiceDto,
  type ServiceFormValues,
} from "./types";

type Banner = { tone: "success" | "error"; message: string } | null;

type ApiResult = {
  ok: boolean;
  status: number;
  body: {
    ok?: boolean;
    error?: string;
    fieldErrors?: FieldErrors;
    service?: ServiceDto;
    services?: ServiceDto[];
  };
};

async function callApi(path: string, init?: RequestInit): Promise<ApiResult> {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  let body: ApiResult["body"] = {};
  try {
    body = (await res.json()) as ApiResult["body"];
  } catch {
    body = {};
  }
  return { ok: res.ok, status: res.status, body };
}

export default function ServicesView() {
  const [services, setServices] = useState<ServiceDto[]>([]);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceFormValues>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState<Banner>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await callApi(`/api/services?includeInactive=${includeInactive}`);
    if (result.ok && Array.isArray(result.body.services)) {
      setServices(result.body.services);
    } else {
      setBanner({
        tone: "error",
        message: result.body.error ?? "Failed to load services",
      });
    }
    setLoading(false);
  }, [includeInactive]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setForm(emptyForm);
    setFieldErrors({});
  }, []);

  const onEdit = useCallback((service: ServiceDto) => {
    setEditingId(service.id);
    setForm(formFromService(service));
    setFieldErrors({});
    setBanner(null);
  }, []);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSubmitting(true);
      setFieldErrors({});
      setBanner(null);

      const payload = formToPayload(form);
      const result = editingId
        ? await callApi(`/api/services/${editingId}`, {
            method: "PATCH",
            body: JSON.stringify(payload),
          })
        : await callApi("/api/services", {
            method: "POST",
            body: JSON.stringify(payload),
          });

      if (result.ok && result.body.service) {
        setBanner({
          tone: "success",
          message: editingId ? "Service updated" : "Service created",
        });
        resetForm();
        await refresh();
      } else if (result.body.fieldErrors) {
        setFieldErrors(result.body.fieldErrors);
        setBanner({ tone: "error", message: "Please fix the errors below" });
      } else {
        setBanner({
          tone: "error",
          message: result.body.error ?? `Request failed (${result.status})`,
        });
      }
      setSubmitting(false);
    },
    [editingId, form, refresh, resetForm]
  );

  const onArchive = useCallback(
    async (service: ServiceDto) => {
      const result = await callApi(`/api/services/${service.id}`, { method: "DELETE" });
      if (result.ok) {
        setBanner({ tone: "success", message: `Archived ${service.name}` });
        if (editingId === service.id) resetForm();
        await refresh();
      } else {
        setBanner({
          tone: "error",
          message: result.body.error ?? `Failed to archive (${result.status})`,
        });
      }
    },
    [editingId, refresh, resetForm]
  );

  const onRestore = useCallback(
    async (service: ServiceDto) => {
      const result = await callApi(`/api/services/${service.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: true }),
      });
      if (result.ok) {
        setBanner({ tone: "success", message: `Restored ${service.name}` });
        await refresh();
      } else {
        setBanner({
          tone: "error",
          message: result.body.error ?? `Failed to restore (${result.status})`,
        });
      }
    },
    [refresh]
  );

  const visibleServices = useMemo(() => services, [services]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="space-y-2">
        <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">Bukay</p>
        <h1 className="text-3xl font-semibold text-white md:text-4xl">Services</h1>
        <p className="text-sm text-slate-300">
          Create, edit, archive, and restore the services bookable on your tenant.
        </p>
      </header>

      {banner ? (
        <div
          role="status"
          data-testid="services-banner"
          className={
            banner.tone === "success"
              ? "rounded-lg border border-emerald-700 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200"
              : "rounded-lg border border-rose-700 bg-rose-950/40 px-4 py-3 text-sm text-rose-200"
          }
        >
          {banner.message}
        </div>
      ) : null}

      <section className="grid gap-8 md:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">All services</h2>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Show archived
            </label>
          </div>

          {loading ? (
            <p className="text-sm text-slate-400">Loading…</p>
          ) : visibleServices.length === 0 ? (
            <p className="text-sm text-slate-400">No services yet. Create one to get started.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {visibleServices.map((service) => (
                <li
                  key={service.id}
                  data-testid={`service-row-${service.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div>
                    <p className="font-medium text-white">
                      {service.name}
                      {!service.active ? (
                        <span className="ml-2 rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-300">
                          archived
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-slate-400">
                      {service.durationMinutes} min · {formatKobo(service.priceKobo)}
                    </p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => onEdit(service)}
                      className="rounded border border-slate-600 px-3 py-1 text-slate-200 hover:bg-slate-800"
                    >
                      Edit
                    </button>
                    {service.active ? (
                      <button
                        type="button"
                        onClick={() => onArchive(service)}
                        className="rounded border border-rose-700 px-3 py-1 text-rose-200 hover:bg-rose-900/30"
                      >
                        Archive
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onRestore(service)}
                        className="rounded border border-emerald-700 px-3 py-1 text-emerald-200 hover:bg-emerald-900/30"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <form
          onSubmit={onSubmit}
          aria-label={editingId ? "Edit service" : "Create service"}
          className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-white">
              {editingId ? "Edit service" : "New service"}
            </h2>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Cancel
              </button>
            ) : null}
          </div>

          <Field label="Name" name="name" error={fieldErrors.name}>
            <input
              id="service-name"
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </Field>

          <Field
            label="Duration (minutes)"
            name="durationMinutes"
            error={fieldErrors.durationMinutes}
          >
            <input
              id="service-duration"
              type="number"
              min={1}
              value={form.durationMinutes}
              onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </Field>

          <Field label="Price (kobo)" name="priceKobo" error={fieldErrors.priceKobo}>
            <input
              id="service-price"
              type="number"
              min={0}
              value={form.priceKobo}
              onChange={(e) => setForm({ ...form, priceKobo: e.target.value })}
              required
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </Field>

          <Field label="Buffer (minutes)" name="bufferMinutes" error={fieldErrors.bufferMinutes}>
            <input
              id="service-buffer"
              type="number"
              min={0}
              value={form.bufferMinutes}
              onChange={(e) => setForm({ ...form, bufferMinutes: e.target.value })}
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </Field>

          <label className="flex items-center gap-2 text-sm text-slate-200">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            Active
          </label>

          {fieldErrors._ ? (
            <p role="alert" className="text-xs text-rose-300">
              {fieldErrors._.join(", ")}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 hover:bg-emerald-400 disabled:opacity-50"
          >
            {submitting ? "Saving…" : editingId ? "Save changes" : "Create service"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Field({
  label,
  name,
  error,
  children,
}: {
  label: string;
  name: string;
  error?: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={`service-${name.toLowerCase()}`} className="text-xs text-slate-300">
        {label}
      </label>
      {children}
      {error && error.length > 0 ? (
        <p role="alert" data-testid={`error-${name}`} className="text-xs text-rose-300">
          {error.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
