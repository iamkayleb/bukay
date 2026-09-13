"use client";

import { useMemo, useState } from "react";

import { tryNormalizeNigerianPhone } from "@/app/lib/phone";
import type { ShopfrontService } from "../data";

// Bukay currently only supports the "Africa/Lagos" tenant timezone (see
// prisma/schema.prisma Tenant.timezone default). It has a fixed UTC+1
// offset with no DST, so the browser's local wall-clock picker value can be
// converted to an instant without a full timezone library.
const LAGOS_OFFSET_MINUTES = 60;

type Step = "service" | "time" | "contact" | "review" | "success";

type BookingStepperProps = {
  slug: string;
  currency: string;
  services: ShopfrontService[];
};

type SubmitError = {
  message: string;
  step: Step;
};

type BookingSuccess = {
  id: string;
  status: string;
  startsAt: string;
  holdExpiresAt: number;
};

function formatPrice(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(priceCents / 100);
}

function localDateTimeToLagosInstant(localValue: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localValue);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  const utcMs =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute)) -
    LAGOS_OFFSET_MINUTES * 60_000;
  return new Date(utcMs);
}

const ERROR_MESSAGES: Record<string, { message: string; step: Step }> = {
  slot_held: {
    message: "That time was just taken by someone else. Please choose another time.",
    step: "time",
  },
  BOOKING_OVERLAP: {
    message: "That time is no longer available. Please choose another time.",
    step: "time",
  },
  OUTSIDE_BUSINESS_HOURS: {
    message: "That time falls outside business hours. Please choose another time.",
    step: "time",
  },
  invalid_phone: {
    message: "Enter a valid Nigerian phone number (e.g. 0803 123 4567).",
    step: "contact",
  },
  service_not_found: {
    message: "That service is no longer available. Please choose another.",
    step: "service",
  },
  tenant_not_found: {
    message: "This shop is no longer accepting bookings.",
    step: "review",
  },
  validation_failed: {
    message: "Please check the details you entered and try again.",
    step: "review",
  },
};

export function BookingStepper({ slug, currency, services }: BookingStepperProps) {
  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string>("");
  const [localStartsAt, setLocalStartsAt] = useState<string>("");
  const [name, setName] = useState<string>("");
  const [phone, setPhone] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);
  const [success, setSuccess] = useState<BookingSuccess | null>(null);

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId) ?? null,
    [services, serviceId]
  );

  const phoneError = useMemo(() => {
    if (!phone.trim()) return null;
    return tryNormalizeNigerianPhone(phone) ? null : "Enter a valid Nigerian phone number.";
  }, [phone]);

  const startsAtInstant = useMemo(
    () => localDateTimeToLagosInstant(localStartsAt),
    [localStartsAt]
  );

  async function handleConfirm() {
    if (!selectedService || !startsAtInstant) return;

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          slug,
          serviceId: selectedService.id,
          startsAt: startsAtInstant.toISOString(),
          name: name.trim(),
          phone: phone.trim(),
          notes: notes.trim() || undefined,
        }),
      });

      const body = await res.json();

      if (!res.ok || !body.ok) {
        const known = ERROR_MESSAGES[body.error as string];
        setError(known ?? { message: "Something went wrong. Please try again.", step: "review" });
        return;
      }

      setSuccess({
        id: body.booking.id,
        status: body.booking.status,
        startsAt: body.booking.startsAt,
        holdExpiresAt: body.hold.expiresAt,
      });
      setStep("success");
    } catch {
      setError({
        message: "Network error. Please check your connection and try again.",
        step: "review",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "success" && success) {
    return (
      <section className="space-y-4 rounded-2xl border border-emerald-800 bg-emerald-950/40 px-6 py-8 text-center">
        <h2 className="text-xl font-semibold text-white">Booking requested</h2>
        <p className="text-sm text-slate-300">
          Your booking is <strong>{success.status.replace("_", " ")}</strong>. Complete payment to
          confirm your slot.
        </p>
        <p className="text-xs text-slate-400">Booking reference: {success.id}</p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <ol className="flex items-center gap-2 text-xs text-slate-400">
        {(["service", "time", "contact", "review"] as Step[]).map((s, i) => (
          <li
            key={s}
            className={`rounded-full px-3 py-1 ${
              step === s ? "bg-emerald-500 text-slate-950" : "bg-slate-800"
            }`}
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {error ? (
        <p className="rounded-lg border border-rose-800 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error.message}
        </p>
      ) : null}

      {step === "service" ? (
        <div className="space-y-4">
          {services.length === 0 ? (
            <p className="text-sm text-slate-400">No services are available for booking yet.</p>
          ) : (
            <ul className="divide-y divide-slate-800 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/60">
              {services.map((service) => (
                <li key={service.id}>
                  <label className="flex cursor-pointer items-center justify-between gap-4 px-6 py-4">
                    <span>
                      <input
                        type="radio"
                        name="service"
                        value={service.id}
                        checked={serviceId === service.id}
                        onChange={() => setServiceId(service.id)}
                        className="mr-3"
                      />
                      <span className="font-medium text-white">{service.name}</span>
                      <span className="block pl-6 text-sm text-slate-400">
                        {service.durationMinutes} min
                      </span>
                    </span>
                    <span className="font-semibold text-emerald-400">
                      {formatPrice(service.priceCents, currency)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            disabled={!serviceId}
            onClick={() => setStep("time")}
            className="w-full rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next
          </button>
        </div>
      ) : null}

      {step === "time" ? (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Date and time</span>
            <input
              type="datetime-local"
              value={localStartsAt}
              onChange={(e) => setLocalStartsAt(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-white"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("service")}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2 font-semibold text-slate-200"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!startsAtInstant}
              onClick={() => setStep("contact")}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === "contact" ? (
        <div className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Your name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-white"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Phone number</span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0803 123 4567"
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-white"
            />
            {phoneError ? <span className="text-xs text-rose-300">{phoneError}</span> : null}
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-slate-300">Notes (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-white"
            />
          </label>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("time")}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2 font-semibold text-slate-200"
            >
              Back
            </button>
            <button
              type="button"
              disabled={!name.trim() || !phone.trim() || !!phoneError}
              onClick={() => setStep("review")}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}

      {step === "review" && selectedService && startsAtInstant ? (
        <div className="space-y-4">
          <dl className="space-y-2 rounded-2xl border border-slate-800 bg-slate-900/60 px-6 py-4 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-400">Service</dt>
              <dd className="text-white">{selectedService.name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">When</dt>
              <dd className="text-white">{startsAtInstant.toLocaleString()}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Name</dt>
              <dd className="text-white">{name}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-400">Phone</dt>
              <dd className="text-white">{phone}</dd>
            </div>
          </dl>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep("contact")}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2 font-semibold text-slate-200"
            >
              Back
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleConfirm}
              className="flex-1 rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? "Booking..." : "Confirm booking"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
