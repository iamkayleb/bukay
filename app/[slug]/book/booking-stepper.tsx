"use client";

import { useMemo, useState, type FormEvent } from "react";

type BookingService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};

type BookingStepperProps = {
  currency: string;
  services: BookingService[];
  tenantName: string;
};

const steps = ["Service", "Time", "Your details", "Review"];

function formatPrice(priceCents: number, currency: string): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(priceCents / 100);
}

export function BookingStepper({ currency, services, tenantName }: BookingStepperProps) {
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");

  const selectedService = useMemo(
    () => services.find((service) => service.id === serviceId),
    [serviceId, services]
  );

  const canContinue =
    (step === 0 && Boolean(selectedService)) ||
    (step === 1 && Boolean(date && time)) ||
    (step === 2 && Boolean(name.trim() && phone.trim()));

  function continueBooking() {
    if (canContinue) {
      setStep((current) => Math.min(current + 1, steps.length - 1));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    continueBooking();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8" noValidate>
      <ol aria-label="Booking progress" className="grid grid-cols-4 gap-2">
        {steps.map((label, index) => {
          const active = index === step;
          const complete = index < step;

          return (
            <li key={label} className="space-y-2" aria-current={active ? "step" : undefined}>
              <div
                className={`h-1 rounded-full ${
                  complete || active ? "bg-emerald-400" : "bg-slate-800"
                }`}
              />
              <p className={`text-xs font-medium ${active ? "text-white" : "text-slate-400"}`}>
                {index + 1}. {label}
              </p>
            </li>
          );
        })}
      </ol>

      {step === 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-lg font-medium text-white">Choose a service</legend>
          <div className="space-y-3">
            {services.map((service) => (
              <label
                key={service.id}
                className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl border p-4 transition ${
                  service.id === serviceId
                    ? "border-emerald-400 bg-emerald-400/10"
                    : "border-slate-800 bg-slate-900/60 hover:border-slate-600"
                }`}
              >
                <span>
                  <input
                    checked={service.id === serviceId}
                    className="sr-only"
                    name="service"
                    onChange={() => setServiceId(service.id)}
                    type="radio"
                    value={service.id}
                  />
                  <span className="block font-medium text-white">{service.name}</span>
                  <span className="block text-sm text-slate-400">
                    {service.durationMinutes} min
                  </span>
                </span>
                <span className="font-semibold text-emerald-400">
                  {formatPrice(service.priceCents, currency)}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {step === 1 ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="col-span-full text-lg font-medium text-white">Choose a time</legend>
          <label className="space-y-2 text-sm text-slate-300">
            Date
            <input
              className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              min={new Date().toISOString().slice(0, 10)}
              onChange={(event) => setDate(event.target.value)}
              type="date"
              value={date}
            />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            Time
            <input
              className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              onChange={(event) => setTime(event.target.value)}
              type="time"
              value={time}
            />
          </label>
        </fieldset>
      ) : null}

      {step === 2 ? (
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="col-span-full text-lg font-medium text-white">Your details</legend>
          <label className="space-y-2 text-sm text-slate-300">
            Full name
            <input
              autoComplete="name"
              className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              onChange={(event) => setName(event.target.value)}
              required
              value={name}
            />
          </label>
          <label className="space-y-2 text-sm text-slate-300">
            Phone number
            <input
              autoComplete="tel"
              className="block w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white"
              inputMode="tel"
              onChange={(event) => setPhone(event.target.value)}
              required
              type="tel"
              value={phone}
            />
          </label>
        </fieldset>
      ) : null}

      {step === 3 && selectedService ? (
        <section
          aria-labelledby="booking-review-heading"
          className="rounded-xl border border-slate-800 bg-slate-900/60 p-5"
        >
          <h2 id="booking-review-heading" className="text-lg font-medium text-white">
            Review your booking
          </h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Service</dt>
              <dd>{selectedService.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">When</dt>
              <dd>
                {date} at {time}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">For</dt>
              <dd>
                {name} · {phone}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-400">Price</dt>
              <dd>{formatPrice(selectedService.priceCents, currency)}</dd>
            </div>
          </dl>
          <p className="mt-5 text-sm text-slate-400">
            Your appointment at {tenantName} will be confirmed after payment.
          </p>
        </section>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <button
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={step === 0}
          onClick={() => setStep((current) => Math.max(current - 1, 0))}
          type="button"
        >
          Back
        </button>
        {step < steps.length - 1 ? (
          <button
            className="rounded-lg bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canContinue}
            type="submit"
          >
            Continue
          </button>
        ) : (
          <p className="text-sm text-emerald-300">Ready to confirm your booking.</p>
        )}
      </div>
    </form>
  );
}
