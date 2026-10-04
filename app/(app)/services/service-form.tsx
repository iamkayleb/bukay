"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type FormValues = {
  name: string;
  durationMinutes: string;
  priceNaira: string;
};

const initialValues: FormValues = {
  name: "",
  durationMinutes: "60",
  priceNaira: "",
};

function priceToKobo(value: string) {
  const price = Number(value);
  return Number.isFinite(price) ? Math.round(price * 100) : Number.NaN;
}

export function ServiceForm() {
  const router = useRouter();
  const [values, setValues] = useState(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const name = values.name.trim();
    const durationMinutes = Number(values.durationMinutes);
    const priceKobo = priceToKobo(values.priceNaira);

    if (!name || !Number.isInteger(durationMinutes) || durationMinutes < 1 || priceKobo < 0) {
      setError("Enter a name, duration, and valid price.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, durationMinutes, priceKobo, bufferMinutes: 0, active: true }),
      });
      const result = await response.json();

      if (!response.ok || !result.ok) {
        setError("Unable to create service. Please try again.");
        return;
      }

      setValues(initialValues);
      router.refresh();
    } catch {
      setError("Unable to create service. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="rounded-lg border border-slate-800 bg-slate-900 p-5" onSubmit={createService}>
      <h2 className="text-lg font-semibold text-white">Add a service</h2>
      <p className="mt-1 text-sm text-slate-400">Services are immediately available for bookings.</p>

      {error ? (
        <p className="mt-4 rounded-md border border-red-900/70 px-3 py-2 text-sm text-red-200" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 space-y-4">
        <label className="block text-sm font-medium text-slate-200" htmlFor="service-name">
          Name
        </label>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          id="service-name"
          required
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
        />

        <label className="block text-sm font-medium text-slate-200" htmlFor="service-duration">
          Duration (minutes)
        </label>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          id="service-duration"
          min="1"
          required
          type="number"
          value={values.durationMinutes}
          onChange={(event) => setValues({ ...values, durationMinutes: event.target.value })}
        />

        <label className="block text-sm font-medium text-slate-200" htmlFor="service-price">
          Price (NGN)
        </label>
        <input
          className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white"
          id="service-price"
          min="0"
          required
          step="0.01"
          type="number"
          value={values.priceNaira}
          onChange={(event) => setValues({ ...values, priceNaira: event.target.value })}
        />
      </div>

      <button
        className="mt-6 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "Adding..." : "Add service"}
      </button>
    </form>
  );
}
