"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import {
  nairaInputToKobo,
  validateServiceForm,
  type ServiceFieldErrors,
  type ServiceFormState,
} from "./services-manager";

const emptyForm: ServiceFormState = {
  name: "",
  durationMinutes: "60",
  priceNaira: "",
  bufferMinutes: "0",
  active: true,
};

export type CreatedService = {
  id: string;
  name: string;
};

export type CreateServiceResult =
  | { ok: true; service: CreatedService }
  | { ok: false; error: string; fieldErrors?: ServiceFieldErrors };

export async function createService(input: {
  name: string;
  durationMinutes: number;
  priceKobo: number;
  bufferMinutes: number;
  active: boolean;
}): Promise<CreateServiceResult> {
  let response: Response;
  try {
    response = await fetch("/api/services", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: "Unable to create service" };
  }

  let data: { ok?: boolean; error?: string; service?: CreatedService };
  try {
    data = (await response.json()) as { ok?: boolean; error?: string; service?: CreatedService };
  } catch {
    return { ok: false, error: "Unable to create service" };
  }

  if (!response.ok || !data.ok || !data.service) {
    return { ok: false, error: data.error ?? "Unable to create service" };
  }

  return { ok: true, service: data.service };
}

export async function submitCreateServiceForm(
  form: ServiceFormState
): Promise<CreateServiceResult> {
  const fieldErrors = validateServiceForm(form);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "validation_failed", fieldErrors };
  }

  return createService({
    name: form.name.trim(),
    durationMinutes: Number(form.durationMinutes),
    priceKobo: nairaInputToKobo(form.priceNaira),
    bufferMinutes: Number(form.bufferMinutes),
    active: form.active,
  });
}

export function ServiceForm() {
  const router = useRouter();
  const [form, setForm] = useState<ServiceFormState>(emptyForm);
  const [errors, setErrors] = useState<ServiceFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setIsSaving(true);

    try {
      const result = await submitCreateServiceForm(form);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? { _form: result.error });
        return;
      }

      setErrors({});
      setForm(emptyForm);
      setNotice("Service created.");
      router.refresh();
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="rounded-lg border border-slate-800 bg-slate-900/40 p-5"
      onSubmit={(event) => void onSubmit(event)}
    >
      <h3 className="text-lg font-semibold text-white">Create service</h3>
      <p className="mt-1 text-sm text-slate-400">Add a service to this business menu.</p>

      {notice ? (
        <p className="mt-4 rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
          {notice}
        </p>
      ) : null}
      {errors._form ? (
        <p className="mt-4 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {errors._form}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        <label className="block" htmlFor="service-name">
          <span className="text-sm font-medium text-slate-200">Name</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            id="service-name"
            name="name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          {errors.name ? (
            <span className="mt-1 block text-xs text-red-300">{errors.name}</span>
          ) : null}
        </label>

        <label className="block" htmlFor="service-duration">
          <span className="text-sm font-medium text-slate-200">Duration minutes</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            id="service-duration"
            min="1"
            name="durationMinutes"
            type="number"
            value={form.durationMinutes}
            onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })}
          />
          {errors.durationMinutes ? (
            <span className="mt-1 block text-xs text-red-300">{errors.durationMinutes}</span>
          ) : null}
        </label>

        <label className="block" htmlFor="service-price">
          <span className="text-sm font-medium text-slate-200">Price (NGN)</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            id="service-price"
            min="0"
            name="priceNaira"
            step="0.01"
            type="number"
            value={form.priceNaira}
            onChange={(event) => setForm({ ...form, priceNaira: event.target.value })}
          />
          {errors.priceNaira ? (
            <span className="mt-1 block text-xs text-red-300">{errors.priceNaira}</span>
          ) : null}
        </label>

        <label className="block" htmlFor="service-buffer">
          <span className="text-sm font-medium text-slate-200">Buffer minutes</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            id="service-buffer"
            min="0"
            name="bufferMinutes"
            type="number"
            value={form.bufferMinutes}
            onChange={(event) => setForm({ ...form, bufferMinutes: event.target.value })}
          />
          {errors.bufferMinutes ? (
            <span className="mt-1 block text-xs text-red-300">{errors.bufferMinutes}</span>
          ) : null}
        </label>

        <label
          className="flex items-center gap-3 text-sm font-medium text-slate-200"
          htmlFor="service-active"
        >
          <input
            checked={form.active}
            className="h-4 w-4 accent-emerald-500"
            id="service-active"
            name="active"
            type="checkbox"
            onChange={(event) => setForm({ ...form, active: event.target.checked })}
          />
          Active
        </label>
      </div>

      <button
        className="mt-6 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? "Saving..." : "Create service"}
      </button>
    </form>
  );
}
