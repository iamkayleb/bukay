"use client";

import { useEffect, useMemo, useState } from "react";

type Service = {
  id: string;
  name: string;
  durationMinutes: number;
  active: boolean;
};

type Staff = {
  id: string;
  name: string;
  active: boolean;
};

type Client = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
};

type BookingSummary = {
  id: string;
  serviceId: string;
  staffId: string | null;
  clientId: string;
  startsAt: string;
  endsAt: string;
  notes: string | null;
  clientName?: string;
};

type ManualBookingFormProps = {
  services: Service[];
  staff: Staff[];
  onCreated?: (booking: BookingSummary) => void;
};

type ClientMode = "existing" | "new";

type Status =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "error"; message: string }
  | { kind: "success"; booking: BookingSummary };

const CLIENT_SEARCH_DEBOUNCE_MS = 200;

function formatDateTimeLocal(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  // toISOString gives UTC; for a datetime-local input we want the wall-clock
  // interpretation the browser will display. `datetime-local` submits in the
  // user's local tz; when parsed back to Date it maps to the right instant.
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function ManualBookingForm({ services, staff, onCreated }: ManualBookingFormProps) {
  const activeServices = useMemo(() => services.filter((s) => s.active), [services]);
  const activeStaff = useMemo(() => staff.filter((s) => s.active), [staff]);

  const [serviceId, setServiceId] = useState(activeServices[0]?.id ?? "");
  const [staffId, setStaffId] = useState(activeStaff[0]?.id ?? "");
  const [startsAt, setStartsAt] = useState("");
  const [notes, setNotes] = useState("");

  const [clientMode, setClientMode] = useState<ClientMode>("existing");
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<Client[]>([]);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [searching, setSearching] = useState(false);

  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newEmail, setNewEmail] = useState("");

  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (clientMode !== "existing" || clientQuery.trim().length < 2) {
      setClientResults([]);
      return;
    }

    const query = clientQuery.trim();
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/clients?q=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          setClientResults([]);
          return;
        }
        const body = (await res.json()) as { clients?: Client[] };
        setClientResults(body.clients ?? []);
      } catch (error) {
        if (!(error instanceof DOMException) || error.name !== "AbortError") {
          setClientResults([]);
        }
      } finally {
        setSearching(false);
      }
    }, CLIENT_SEARCH_DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [clientMode, clientQuery]);

  function reset() {
    setStartsAt("");
    setNotes("");
    setClientQuery("");
    setSelectedClient(null);
    setClientResults([]);
    setNewName("");
    setNewPhone("");
    setNewEmail("");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus({ kind: "submitting" });

    if (!serviceId) {
      setStatus({ kind: "error", message: "Choose a service" });
      return;
    }
    if (!startsAt) {
      setStatus({ kind: "error", message: "Choose a start time" });
      return;
    }

    const iso = new Date(startsAt).toISOString();
    const payload: Record<string, unknown> = {
      serviceId,
      startsAt: iso,
    };
    if (staffId) payload.staffId = staffId;
    if (notes.trim()) payload.notes = notes.trim();

    if (clientMode === "existing") {
      if (!selectedClient) {
        setStatus({ kind: "error", message: "Pick a client from the search results" });
        return;
      }
      payload.clientId = selectedClient.id;
    } else {
      if (!newName.trim() || !newPhone.trim()) {
        setStatus({ kind: "error", message: "New client name and phone are required" });
        return;
      }
      payload.newClient = {
        name: newName.trim(),
        phone: newPhone.trim(),
        ...(newEmail.trim() ? { email: newEmail.trim() } : {}),
      };
    }

    try {
      const res = await fetch("/api/bookings/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = mapError(body?.error, res.status);
        setStatus({ kind: "error", message });
        return;
      }

      const booking = body.booking as BookingSummary;
      const clientName =
        (body?.client?.name as string | undefined) ??
        (clientMode === "new" ? newName.trim() : selectedClient?.name);
      const summary: BookingSummary = { ...booking, clientName };

      setStatus({ kind: "success", booking: summary });
      onCreated?.(summary);
      reset();
    } catch {
      setStatus({ kind: "error", message: "Could not reach the server. Try again." });
    }
  }

  const submitting = status.kind === "submitting";

  return (
    <form
      onSubmit={handleSubmit}
      aria-label="Manual booking form"
      className="flex flex-col gap-5 rounded-lg border border-slate-800 bg-slate-900/60 p-5"
    >
      <fieldset className="flex flex-col gap-3" disabled={submitting}>
        <legend className="text-sm font-semibold text-white">Client</legend>
        <div className="flex gap-3 text-xs">
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="clientMode"
              value="existing"
              checked={clientMode === "existing"}
              onChange={() => {
                setClientMode("existing");
                setStatus({ kind: "idle" });
              }}
            />
            Existing client
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="radio"
              name="clientMode"
              value="new"
              checked={clientMode === "new"}
              onChange={() => {
                setClientMode("new");
                setStatus({ kind: "idle" });
              }}
            />
            New client
          </label>
        </div>

        {clientMode === "existing" ? (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              Search by name or phone
              <input
                type="search"
                value={clientQuery}
                onChange={(e) => {
                  setClientQuery(e.target.value);
                  setSelectedClient(null);
                }}
                placeholder="At least 2 characters"
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
              />
            </label>
            {searching ? (
              <p className="text-xs text-slate-400">Searching…</p>
            ) : null}
            {clientResults.length > 0 ? (
              <ul className="max-h-40 overflow-y-auto rounded border border-slate-800 bg-slate-950 text-sm">
                {clientResults.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedClient(c);
                        setClientQuery(`${c.name} · ${c.phone}`);
                        setClientResults([]);
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-800"
                    >
                      <span className="font-medium text-white">{c.name}</span>
                      <span className="ml-2 text-slate-400">{c.phone}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {selectedClient ? (
              <p className="text-xs text-emerald-300">
                Selected: {selectedClient.name} ({selectedClient.phone})
              </p>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              Name
              <input
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300">
              Phone
              <input
                required
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+234…"
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-300 sm:col-span-2">
              Email (optional)
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
              />
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2" disabled={submitting}>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Service
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          >
            {activeServices.length === 0 ? <option value="">No active services</option> : null}
            {activeServices.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.durationMinutes}m)
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300">
          Staff (optional)
          <select
            value={staffId}
            onChange={(e) => setStaffId(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          >
            <option value="">Unassigned</option>
            {activeStaff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300 sm:col-span-2">
          Start time
          <input
            type="datetime-local"
            required
            value={startsAt ? formatDateTimeLocal(startsAt) : ""}
            onChange={(e) => setStartsAt(e.target.value)}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-slate-300 sm:col-span-2">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="rounded border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-white"
          />
        </label>
      </fieldset>

      <div className="flex items-center justify-between">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-60"
        >
          {submitting ? "Creating…" : "Create booking"}
        </button>
        {status.kind === "error" ? (
          <p role="alert" className="text-sm text-red-300">
            {status.message}
          </p>
        ) : null}
        {status.kind === "success" ? (
          <p role="status" className="text-sm text-emerald-300">
            Booking created for {status.booking.clientName ?? "client"}.
          </p>
        ) : null}
      </div>
    </form>
  );
}

function mapError(code: unknown, status: number): string {
  switch (code) {
    case "validation_failed":
      return "Please check the form — some fields are missing or invalid.";
    case "service_not_found":
      return "That service is no longer available.";
    case "service_inactive":
      return "That service is inactive.";
    case "staff_not_found":
      return "That staff member is no longer available.";
    case "staff_inactive":
      return "That staff member is inactive.";
    case "client_not_found":
      return "That client no longer exists.";
    case "booking_conflict":
      return "That slot is already taken for the selected staff.";
    case "tenant_required":
      return "Could not identify the workspace.";
    default:
      return `Booking failed (HTTP ${status}).`;
  }
}
