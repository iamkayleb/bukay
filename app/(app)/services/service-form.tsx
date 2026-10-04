"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const inputClass =
  "mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400";

export function ServiceForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const priceKobo = Math.round(Number(data.get("priceNaira")) * 100);

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/services", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          name: String(data.get("name") ?? "").trim(),
          durationMinutes: Number(data.get("durationMinutes")),
          priceKobo,
          bufferMinutes: Number(data.get("bufferMinutes")),
          active: true,
        }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(
          body.error === "service_name_conflict"
            ? "A service with that name already exists."
            : (body.error ?? "Unable to create service")
        );
      }
      form.reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create service");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      aria-label="Create service"
      className="rounded-lg border border-slate-800 bg-slate-900 p-5"
      onSubmit={(event) => void onSubmit(event)}
    >
      <h2 className="text-lg font-semibold text-white">Create service</h2>
      {error ? (
        <p className="mt-4 rounded-md border border-red-900/70 bg-red-950/50 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}
      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-slate-200">Name</span>
          <input className={inputClass} name="name" required />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-200">Duration minutes</span>
          <input
            className={inputClass}
            defaultValue="60"
            min="1"
            name="durationMinutes"
            type="number"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-200">Price (NGN)</span>
          <input
            className={inputClass}
            min="0"
            name="priceNaira"
            step="0.01"
            type="number"
            required
          />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-200">Buffer minutes</span>
          <input
            className={inputClass}
            defaultValue="0"
            min="0"
            name="bufferMinutes"
            type="number"
            required
          />
        </label>
      </div>
      <button
        className="mt-6 rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        disabled={isSaving}
        type="submit"
      >
        {isSaving ? "Saving..." : "Create service"}
      </button>
    </form>
  );
}
