"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

import { isValidNigerianPhone } from "@/app/lib/phone";

export type ClientFormState = {
  name: string;
  phone: string;
};

export type ClientFieldErrors = Partial<Record<keyof ClientFormState | "_form", string>>;

const emptyForm: ClientFormState = { name: "", phone: "" };

export type CreatedClient = {
  id: string;
  name: string;
  phone: string;
};

export type CreateClientResult =
  | { ok: true; client: CreatedClient }
  | { ok: false; error: string; fieldErrors?: ClientFieldErrors };

type CreateClientResponse = {
  ok?: boolean;
  error?: string;
  client?: CreatedClient;
  fieldErrors?: Partial<Record<string, string[]>>;
  formErrors?: string[];
};

export function validateClientForm(form: ClientFormState): ClientFieldErrors {
  const errors: ClientFieldErrors = {};

  if (!form.name.trim()) {
    errors.name = "Name is required";
  }

  if (!form.phone.trim()) {
    errors.phone = "Phone is required";
  } else if (!isValidNigerianPhone(form.phone)) {
    errors.phone = "Enter a valid Nigerian mobile number";
  }

  return errors;
}

function apiFieldErrors(data: CreateClientResponse): ClientFieldErrors | undefined {
  if (data.error === "client_phone_conflict") {
    return { phone: "A client with this phone number already exists" };
  }

  if (data.error === "validation_failed") {
    const fieldErrors = data.fieldErrors ?? {};
    return {
      name: fieldErrors.name?.[0],
      phone: fieldErrors.phone?.[0],
      _form: data.formErrors?.[0],
    };
  }

  return undefined;
}

export async function createClient(input: ClientFormState): Promise<CreateClientResult> {
  let response: Response;
  try {
    response = await fetch("/api/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(input),
    });
  } catch {
    return { ok: false, error: "Unable to add client" };
  }

  let data: CreateClientResponse;
  try {
    data = (await response.json()) as CreateClientResponse;
  } catch {
    return { ok: false, error: "Unable to add client" };
  }

  if (!response.ok || !data.ok || !data.client) {
    return {
      ok: false,
      error: data.error ?? "Unable to add client",
      fieldErrors: apiFieldErrors(data),
    };
  }

  return { ok: true, client: data.client };
}

export async function submitCreateClientForm(form: ClientFormState): Promise<CreateClientResult> {
  const fieldErrors = validateClientForm(form);
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, error: "validation_failed", fieldErrors };
  }

  return createClient({ name: form.name.trim(), phone: form.phone.trim() });
}

export function ClientForm() {
  const router = useRouter();
  const [form, setForm] = useState<ClientFormState>(emptyForm);
  const [errors, setErrors] = useState<ClientFieldErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotice(null);
    setIsSaving(true);

    try {
      const result = await submitCreateClientForm(form);
      if (!result.ok) {
        setErrors(result.fieldErrors ?? { _form: result.error });
        return;
      }

      setErrors({});
      setForm(emptyForm);
      setNotice("Client added.");
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
      <h3 className="text-lg font-semibold text-white">Add client</h3>
      <p className="mt-1 text-sm text-slate-400">Record a walk-in or a regular by phone number.</p>

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
        <label className="block" htmlFor="client-name">
          <span className="text-sm font-medium text-slate-200">Name</span>
          <input
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            id="client-name"
            name="name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
          {errors.name ? (
            <span className="mt-1 block text-xs text-red-300">{errors.name}</span>
          ) : null}
        </label>

        <label className="block" htmlFor="client-phone">
          <span className="text-sm font-medium text-slate-200">Phone</span>
          <input
            autoComplete="tel"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
            id="client-phone"
            inputMode="tel"
            name="phone"
            placeholder="0806 177 8668"
            type="tel"
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
          {errors.phone ? (
            <span className="mt-1 block text-xs text-red-300">{errors.phone}</span>
          ) : null}
        </label>
      </div>

      <button
        className="mt-6 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? "Saving..." : "Add client"}
      </button>
    </form>
  );
}
