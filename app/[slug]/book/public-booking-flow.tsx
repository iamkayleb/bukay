"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

export type PublicBookingService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  currency: string;
};

export type PublicBookingDraft = {
  serviceId: string;
  date: string;
  slot: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  notes: string;
};

export type PublicBookingStep = "service" | "date" | "slot" | "details" | "confirm";

type PublicBookingFlowProps = {
  tenantName: string;
  tenantSlug: string;
  services: PublicBookingService[];
};

type SubmissionState = "idle" | "submitting" | "submitted";

export const PUBLIC_BOOKING_STEPS: PublicBookingStep[] = [
  "service",
  "date",
  "slot",
  "details",
  "confirm",
];

export const emptyPublicBookingDraft: PublicBookingDraft = {
  serviceId: "",
  date: "",
  slot: "",
  customerName: "",
  customerPhone: "",
  customerEmail: "",
  notes: "",
};

const STEP_LABELS: Record<PublicBookingStep, string> = {
  service: "Service",
  date: "Date",
  slot: "Time",
  details: "Details",
  confirm: "Confirm",
};

const DEFAULT_SLOT_START_HOUR = 9;
const DEFAULT_SLOT_END_HOUR = 17;

export function bookingDraftStorageKey(tenantSlug: string) {
  return `bukay:${tenantSlug}:booking-draft`;
}

export function getStepIndex(step: PublicBookingStep) {
  return PUBLIC_BOOKING_STEPS.indexOf(step);
}

export function canProceedFromStep(
  step: PublicBookingStep,
  draft: PublicBookingDraft,
  services: PublicBookingService[]
) {
  if (step === "service") {
    return services.some((service) => service.id === draft.serviceId);
  }

  if (step === "date") {
    return !!draft.date;
  }

  if (step === "slot") {
    return !!draft.slot;
  }

  if (step === "details") {
    return !!draft.customerName.trim() && !!draft.customerPhone.trim();
  }

  return true;
}

export function nextBookingStep(step: PublicBookingStep) {
  const index = getStepIndex(step);
  return PUBLIC_BOOKING_STEPS[Math.min(index + 1, PUBLIC_BOOKING_STEPS.length - 1)];
}

export function previousBookingStep(step: PublicBookingStep) {
  const index = getStepIndex(step);
  return PUBLIC_BOOKING_STEPS[Math.max(index - 1, 0)];
}

export function buildAvailableSlots(date: string, service?: PublicBookingService) {
  if (!date || !service) {
    return [];
  }

  const slots: string[] = [];
  const stepMinutes = Math.max(15, Math.min(service.durationMinutes, 60));
  const latestStart = DEFAULT_SLOT_END_HOUR * 60 - service.durationMinutes;

  for (let minutes = DEFAULT_SLOT_START_HOUR * 60; minutes <= latestStart; minutes += stepMinutes) {
    const hours = Math.floor(minutes / 60);
    const minute = minutes % 60;
    slots.push(`${String(hours).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  }

  return slots;
}

export function buildPublicBookingPayload(
  tenantSlug: string,
  draft: PublicBookingDraft,
  services: PublicBookingService[]
) {
  const service = services.find((candidate) => candidate.id === draft.serviceId);
  if (!service || !draft.date || !draft.slot) {
    return null;
  }

  const startsAt = new Date(`${draft.date}T${draft.slot}:00`);
  const endsAt = new Date(startsAt.getTime() + service.durationMinutes * 60_000);

  return {
    tenantSlug,
    serviceId: service.id,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    client: {
      name: draft.customerName.trim(),
      phone: draft.customerPhone.trim(),
      email: draft.customerEmail.trim() || null,
    },
    notes: draft.notes.trim() || null,
  };
}

function formatPrice(service: PublicBookingService) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: service.currency,
    maximumFractionDigits: 0,
  }).format(service.priceCents / 100);
}

function mergeStoredDraft(value: string | null): PublicBookingDraft {
  if (!value) {
    return emptyPublicBookingDraft;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PublicBookingDraft>;
    return {
      ...emptyPublicBookingDraft,
      serviceId: typeof parsed.serviceId === "string" ? parsed.serviceId : "",
      date: typeof parsed.date === "string" ? parsed.date : "",
      slot: typeof parsed.slot === "string" ? parsed.slot : "",
      customerName: typeof parsed.customerName === "string" ? parsed.customerName : "",
      customerPhone: typeof parsed.customerPhone === "string" ? parsed.customerPhone : "",
      customerEmail: typeof parsed.customerEmail === "string" ? parsed.customerEmail : "",
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
    };
  } catch {
    return emptyPublicBookingDraft;
  }
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

export function PublicBookingFlow({ tenantName, tenantSlug, services }: PublicBookingFlowProps) {
  const [draft, setDraft] = useState<PublicBookingDraft>(emptyPublicBookingDraft);
  const [currentStep, setCurrentStep] = useState<PublicBookingStep>("service");
  const [submissionState, setSubmissionState] = useState<SubmissionState>("idle");
  const [loadedDraftSlug, setLoadedDraftSlug] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedService = useMemo(
    () => services.find((service) => service.id === draft.serviceId),
    [draft.serviceId, services]
  );
  const slots = useMemo(
    () => buildAvailableSlots(draft.date, selectedService),
    [draft.date, selectedService]
  );

  useEffect(() => {
    setDraft(mergeStoredDraft(window.localStorage.getItem(bookingDraftStorageKey(tenantSlug))));
    setLoadedDraftSlug(tenantSlug);
  }, [tenantSlug]);

  useEffect(() => {
    if (loadedDraftSlug !== tenantSlug) {
      return;
    }

    window.localStorage.setItem(bookingDraftStorageKey(tenantSlug), JSON.stringify(draft));
  }, [draft, loadedDraftSlug, tenantSlug]);

  function updateDraft(update: Partial<PublicBookingDraft>) {
    setDraft((current) => ({ ...current, ...update }));
    setNotice(null);
    setSubmissionState("idle");
  }

  function goNext() {
    if (!canProceedFromStep(currentStep, draft, services)) {
      setNotice("Complete this step before continuing.");
      return;
    }

    setCurrentStep(nextBookingStep(currentStep));
    setNotice(null);
  }

  function goBack() {
    setCurrentStep(previousBookingStep(currentStep));
    setNotice(null);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const payload = buildPublicBookingPayload(tenantSlug, draft, services);
    if (!payload || !canProceedFromStep("details", draft, services)) {
      setNotice("Complete your booking details before confirming.");
      return;
    }

    setSubmissionState("submitting");
    setNotice(null);

    try {
      const response = await fetch("/api/public/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.ok === false) {
        throw new Error(data.error ?? "Unable to reserve this appointment.");
      }

      window.localStorage.removeItem(bookingDraftStorageKey(tenantSlug));
      setSubmissionState("submitted");
      setNotice("Appointment request received.");
    } catch (error) {
      setSubmissionState("idle");
      setNotice(error instanceof Error ? error.message : "Unable to reserve this appointment.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-7">
        <header className="flex flex-col gap-3 border-b border-slate-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-emerald-300">
              {tenantName}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">Book an appointment</h1>
          </div>
          <ol className="grid grid-cols-5 gap-2 text-center text-xs font-medium text-slate-400">
            {PUBLIC_BOOKING_STEPS.map((step, index) => {
              const isActive = step === currentStep;
              const isComplete = getStepIndex(currentStep) > index;

              return (
                <li
                  className={
                    isActive || isComplete
                      ? "rounded-md border border-emerald-500 bg-emerald-500/10 px-2 py-2 text-emerald-200"
                      : "rounded-md border border-slate-800 bg-slate-900 px-2 py-2"
                  }
                  key={step}
                >
                  {STEP_LABELS[step]}
                </li>
              );
            })}
          </ol>
        </header>

        {notice ? (
          <p className="rounded-md border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-200">
            {notice}
          </p>
        ) : null}

        <form className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]" onSubmit={submitBooking}>
          <section className="min-h-[420px] rounded-lg border border-slate-800 bg-slate-900 p-5">
            {currentStep === "service" ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Choose a service</h2>
                {services.length === 0 ? (
                  <p className="text-sm text-slate-400">No services are available for booking.</p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {services.map((service) => (
                      <button
                        className={
                          draft.serviceId === service.id
                            ? "rounded-lg border border-emerald-500 bg-emerald-500/10 p-4 text-left"
                            : "rounded-lg border border-slate-800 bg-slate-950 p-4 text-left hover:border-emerald-400"
                        }
                        key={service.id}
                        type="button"
                        onClick={() =>
                          updateDraft({ serviceId: service.id, slot: draft.slot ? "" : draft.slot })
                        }
                      >
                        <span className="block font-medium text-white">{service.name}</span>
                        <span className="mt-2 block text-sm text-slate-400">
                          {service.durationMinutes} min - {formatPrice(service)}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {currentStep === "date" ? (
              <div className="max-w-md space-y-4">
                <h2 className="text-xl font-semibold text-white">Choose a date</h2>
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Appointment date</span>
                  <input
                    className="mt-2 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                    min={todayInputValue()}
                    type="date"
                    value={draft.date}
                    onChange={(event) => updateDraft({ date: event.target.value, slot: "" })}
                  />
                </label>
              </div>
            ) : null}

            {currentStep === "slot" ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Choose a time</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {slots.map((slot) => (
                    <button
                      className={
                        draft.slot === slot
                          ? "rounded-md border border-emerald-500 bg-emerald-500 px-3 py-3 text-sm font-semibold text-slate-950"
                          : "rounded-md border border-slate-800 bg-slate-950 px-3 py-3 text-sm font-medium text-slate-100 hover:border-emerald-400"
                      }
                      key={slot}
                      type="button"
                      onClick={() => updateDraft({ slot })}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {currentStep === "details" ? (
              <div className="max-w-xl space-y-4">
                <h2 className="text-xl font-semibold text-white">Your details</h2>
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Name</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                    value={draft.customerName}
                    onChange={(event) => updateDraft({ customerName: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Phone</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                    inputMode="tel"
                    value={draft.customerPhone}
                    onChange={(event) => updateDraft({ customerPhone: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Email</span>
                  <input
                    className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                    inputMode="email"
                    value={draft.customerEmail}
                    onChange={(event) => updateDraft({ customerEmail: event.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium text-slate-200">Notes</span>
                  <textarea
                    className="mt-1 min-h-24 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-emerald-400"
                    value={draft.notes}
                    onChange={(event) => updateDraft({ notes: event.target.value })}
                  />
                </label>
              </div>
            ) : null}

            {currentStep === "confirm" ? (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold text-white">Confirm appointment</h2>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <dt className="text-slate-500">Service</dt>
                    <dd className="mt-1 font-medium text-white">{selectedService?.name}</dd>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <dt className="text-slate-500">Date and time</dt>
                    <dd className="mt-1 font-medium text-white">
                      {draft.date} at {draft.slot}
                    </dd>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <dt className="text-slate-500">Name</dt>
                    <dd className="mt-1 font-medium text-white">{draft.customerName}</dd>
                  </div>
                  <div className="rounded-md border border-slate-800 bg-slate-950 p-3">
                    <dt className="text-slate-500">Phone</dt>
                    <dd className="mt-1 font-medium text-white">{draft.customerPhone}</dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </section>

          <aside className="h-fit rounded-lg border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-base font-semibold text-white">Summary</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Service</dt>
                <dd className="mt-1 text-slate-200">{selectedService?.name ?? "Not selected"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Date</dt>
                <dd className="mt-1 text-slate-200">{draft.date || "Not selected"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Time</dt>
                <dd className="mt-1 text-slate-200">{draft.slot || "Not selected"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Customer</dt>
                <dd className="mt-1 text-slate-200">{draft.customerName || "Not entered"}</dd>
              </div>
            </dl>

            <div className="mt-6 flex gap-3">
              {currentStep !== "service" ? (
                <button
                  className="rounded-md border border-slate-700 px-4 py-2 text-sm font-medium text-slate-100 hover:border-slate-500"
                  type="button"
                  onClick={goBack}
                >
                  Back
                </button>
              ) : null}
              {currentStep === "confirm" ? (
                <button
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={submissionState !== "idle"}
                  type="submit"
                >
                  {submissionState === "submitting" ? "Confirming..." : "Confirm"}
                </button>
              ) : (
                <button
                  className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={services.length === 0}
                  type="button"
                  onClick={goNext}
                >
                  Continue
                </button>
              )}
            </div>
          </aside>
        </form>
      </div>
    </main>
  );
}
