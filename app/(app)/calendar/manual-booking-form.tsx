"use client";

import { FormEvent, useMemo, useState } from "react";

export type ClientOption = {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
};

export type ServiceOption = {
  id: string;
  name: string;
  durationMinutes: number;
};

export type ManualBookingFormState = {
  clientMode: "existing" | "new";
  clientSearch: string;
  selectedClientId: string;
  newClientName: string;
  newClientPhone: string;
  newClientEmail: string;
  serviceId: string;
  startsAt: string;
  notes: string;
};

export type ManualBookingFieldErrors = Partial<
  Record<keyof ManualBookingFormState | "_form", string>
>;

export const emptyManualBookingForm: ManualBookingFormState = {
  clientMode: "existing",
  clientSearch: "",
  selectedClientId: "",
  newClientName: "",
  newClientPhone: "",
  newClientEmail: "",
  serviceId: "",
  startsAt: "",
  notes: "",
};

type ManualBookingFormProps = {
  clients?: ClientOption[];
  services?: ServiceOption[];
};

type ApiValidationError = {
  ok: false;
  error?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
};

function firstError(errors: string[] | undefined) {
  return errors?.[0];
}

function hasErrors(errors: ManualBookingFieldErrors) {
  return Object.keys(errors).length > 0;
}

export function filterClients(query: string, clients: ClientOption[]) {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return clients;
  }

  return clients.filter((client) =>
    [client.name, client.phone, client.email ?? ""].some((value) =>
      value.toLowerCase().includes(normalized)
    )
  );
}

export function validateManualBookingForm(
  form: ManualBookingFormState,
  services: ServiceOption[]
): ManualBookingFieldErrors {
  const errors: ManualBookingFieldErrors = {};
  const service = services.find((option) => option.id === form.serviceId);
  const startsAt = form.startsAt ? new Date(form.startsAt) : null;

  if (form.clientMode === "existing" && !form.selectedClientId) {
    errors.selectedClientId = "Choose a client";
  }

  if (form.clientMode === "new") {
    if (!form.newClientName.trim()) {
      errors.newClientName = "Client name is required";
    }

    if (!form.newClientPhone.trim()) {
      errors.newClientPhone = "Phone is required";
    }

    if (form.newClientEmail.trim() && !form.newClientEmail.includes("@")) {
      errors.newClientEmail = "Enter a valid email";
    }
  }

  if (!service) {
    errors.serviceId = "Choose a service";
  }

  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    errors.startsAt = "Choose a valid slot";
  }

  return errors;
}

export function buildManualBookingPayload(form: ManualBookingFormState, services: ServiceOption[]) {
  const service = services.find((option) => option.id === form.serviceId);
  const startsAt = new Date(form.startsAt);
  const endsAt = new Date(startsAt.getTime() + (service?.durationMinutes ?? 0) * 60_000);

  return {
    client:
      form.clientMode === "existing"
        ? { id: form.selectedClientId }
        : {
            name: form.newClientName.trim(),
            phone: form.newClientPhone.trim(),
            email: form.newClientEmail.trim() || null,
          },
    serviceId: form.serviceId,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    notes: form.notes.trim() || null,
  };
}

function mapApiErrors(error: ApiValidationError): ManualBookingFieldErrors {
  const fieldErrors = error.fieldErrors ?? {};

  return {
    selectedClientId: firstError(fieldErrors.clientId),
    newClientName: firstError(fieldErrors.clientName),
    newClientPhone: firstError(fieldErrors.clientPhone),
    newClientEmail: firstError(fieldErrors.clientEmail),
    serviceId: firstError(fieldErrors.serviceId),
    startsAt: firstError(fieldErrors.startsAt),
    notes: firstError(fieldErrors.notes),
    _form: firstError(error.formErrors) ?? error.error,
  };
}

export function ManualBookingForm({ clients = [], services = [] }: ManualBookingFormProps) {
  const [form, setForm] = useState<ManualBookingFormState>(emptyManualBookingForm);
  const [errors, setErrors] = useState<ManualBookingFieldErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const visibleClients = useMemo(
    () => filterClients(form.clientSearch, clients).slice(0, 5),
    [clients, form.clientSearch]
  );

  async function createBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);

    const nextErrors = validateManualBookingForm(form, services);
    if (hasErrors(nextErrors)) {
      setErrors(nextErrors);
      return;
    }

    setErrors({});
    setIsSaving(true);

    try {
      const response = await fetch("/api/bookings/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(buildManualBookingPayload(form, services)),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        if (data.error === "validation_failed") {
          setErrors(mapApiErrors(data));
          return;
        }

        throw new Error(data.error ?? "Unable to create booking");
      }

      setForm(emptyManualBookingForm);
      setNotice("Booking created.");
      window.dispatchEvent(new CustomEvent("booking:manual-created", { detail: data.booking }));
    } catch (error) {
      setErrors({
        _form: error instanceof Error ? error.message : "Unable to create booking",
      });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      className="grid gap-5 rounded-lg border border-slate-800 bg-slate-900 p-5"
      onSubmit={(event) => void createBooking(event)}
    >
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
          Manual booking
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-white">Add a booking</h1>
      </div>

      {notice ? (
        <p className="rounded-md border border-emerald-900/70 bg-emerald-950/40 px-3 py-2 text-sm text-emerald-100">
          {notice}
        </p>
      ) : null}

      {errors._form ? (
        <p className="rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {errors._form}
        </p>
      ) : null}

      <fieldset className="grid gap-3">
        <legend className="text-sm font-medium text-slate-200">Client</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200">
            <input
              checked={form.clientMode === "existing"}
              className="h-4 w-4 accent-emerald-500"
              name="clientMode"
              type="radio"
              onChange={() => setForm({ ...form, clientMode: "existing" })}
            />
            Existing
          </label>
          <label className="flex items-center gap-2 rounded-md border border-slate-700 px-3 py-2 text-sm text-slate-200">
            <input
              checked={form.clientMode === "new"}
              className="h-4 w-4 accent-emerald-500"
              name="clientMode"
              type="radio"
              onChange={() => setForm({ ...form, clientMode: "new", selectedClientId: "" })}
            />
            New
          </label>
        </div>

        {form.clientMode === "existing" ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-sm text-slate-300">Search clients</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                placeholder="Name, phone, or email"
                value={form.clientSearch}
                onChange={(event) =>
                  setForm({ ...form, clientSearch: event.target.value, selectedClientId: "" })
                }
              />
            </label>
            <select
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
              value={form.selectedClientId}
              onChange={(event) => setForm({ ...form, selectedClientId: event.target.value })}
            >
              <option value="">Choose client</option>
              {visibleClients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name} - {client.phone}
                </option>
              ))}
            </select>
            {errors.selectedClientId ? (
              <span className="block text-xs text-red-300">{errors.selectedClientId}</span>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3">
            <label className="block">
              <span className="text-sm text-slate-300">Name</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                value={form.newClientName}
                onChange={(event) => setForm({ ...form, newClientName: event.target.value })}
              />
              {errors.newClientName ? (
                <span className="mt-1 block text-xs text-red-300">{errors.newClientName}</span>
              ) : null}
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Phone</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                value={form.newClientPhone}
                onChange={(event) => setForm({ ...form, newClientPhone: event.target.value })}
              />
              {errors.newClientPhone ? (
                <span className="mt-1 block text-xs text-red-300">{errors.newClientPhone}</span>
              ) : null}
            </label>
            <label className="block">
              <span className="text-sm text-slate-300">Email</span>
              <input
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                type="email"
                value={form.newClientEmail}
                onChange={(event) => setForm({ ...form, newClientEmail: event.target.value })}
              />
              {errors.newClientEmail ? (
                <span className="mt-1 block text-xs text-red-300">{errors.newClientEmail}</span>
              ) : null}
            </label>
          </div>
        )}
      </fieldset>

      <label className="block">
        <span className="text-sm font-medium text-slate-200">Service</span>
        <select
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          value={form.serviceId}
          onChange={(event) => setForm({ ...form, serviceId: event.target.value })}
        >
          <option value="">Choose service</option>
          {services.map((service) => (
            <option key={service.id} value={service.id}>
              {service.name} - {service.durationMinutes} min
            </option>
          ))}
        </select>
        {errors.serviceId ? (
          <span className="mt-1 block text-xs text-red-300">{errors.serviceId}</span>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-200">Slot</span>
        <input
          className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          type="datetime-local"
          value={form.startsAt}
          onChange={(event) => setForm({ ...form, startsAt: event.target.value })}
        />
        {errors.startsAt ? (
          <span className="mt-1 block text-xs text-red-300">{errors.startsAt}</span>
        ) : null}
      </label>

      <label className="block">
        <span className="text-sm font-medium text-slate-200">Notes</span>
        <textarea
          className="mt-1 min-h-24 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </label>

      <button
        className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? "Creating..." : "Create booking"}
      </button>
    </form>
  );
}
