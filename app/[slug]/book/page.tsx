import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

import { createPublicBooking } from "@/app/api/public/bookings/route";
import { computeSlots } from "@/app/lib/availability";
import { prisma } from "@/app/db/prisma";
import { runWithTenantContext } from "@/app/tenancy/tenant-context";

import { getPublicTenantBySlug, isPublicTenantInactive } from "../tenant";

export const revalidate = 0;

const STEPS = [
  { id: 1, label: "Service" },
  { id: 2, label: "Time" },
  { id: 3, label: "Details" },
  { id: 4, label: "Confirm" },
] as const;

type PageProps = {
  params: { slug: string };
  searchParams?: {
    serviceId?: string;
    startsAt?: string;
    error?: string;
    done?: string;
    bookingId?: string;
    sessionId?: string;
  };
};

function formatPrice(priceCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(priceCents / 100);
  } catch {
    return `${(priceCents / 100).toFixed(2)} ${currency}`;
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem === 0 ? `${hours} hr` : `${hours} hr ${rem} min`;
}

function formatSlotLabel(startsAt: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-NG", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(startsAt);
  } catch {
    return startsAt.toISOString();
  }
}

function bookPath(
  slug: string,
  query: Record<string, string | undefined | null>
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value) {
      params.set(key, value);
    }
  }
  const qs = params.toString();
  return qs ? `/${slug}/book?${qs}` : `/${slug}/book`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const slug = params.slug?.trim().toLowerCase();
  if (!slug) {
    return { title: "Book", robots: { index: false, follow: false } };
  }

  const tenant = await getPublicTenantBySlug(slug);
  if (!tenant || isPublicTenantInactive(tenant)) {
    return { title: "Not found", robots: { index: false, follow: false } };
  }

  return {
    title: `Book · ${tenant.name}`,
    description: `Reserve a service with ${tenant.name}.`,
    robots: { index: true, follow: true },
  };
}

function StepperNav({ current }: { current: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Booking steps">
      {STEPS.map((step, index) => {
        const done = step.id < current;
        const active = step.id === current;
        return (
          <li key={step.id} className="flex items-center gap-2">
            {index > 0 ? <span className="text-slate-600" aria-hidden="true">/</span> : null}
            <span
              className={[
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                active
                  ? "bg-emerald-500 text-slate-950"
                  : done
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-slate-800 text-slate-400",
              ].join(" ")}
              aria-current={active ? "step" : undefined}
            >
              <span aria-hidden="true">{step.id}</span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default async function PublicBookPage({ params, searchParams = {} }: PageProps) {
  const slug = params.slug?.trim().toLowerCase();
  if (!slug) {
    notFound();
  }

  const tenant = await getPublicTenantBySlug(slug);
  if (!tenant || isPublicTenantInactive(tenant)) {
    notFound();
  }

  const sessionId = searchParams.sessionId?.trim() || randomUUID();
  const selectedService = tenant.services.find((service) => service.id === searchParams.serviceId);
  const startsAtRaw = searchParams.startsAt?.trim();
  const startsAtDate = startsAtRaw ? new Date(startsAtRaw) : null;
  const startsAtValid = !!startsAtDate && !Number.isNaN(startsAtDate.getTime());

  const done = searchParams.done === "1";
  let step = 1;
  if (done) {
    step = 4;
  } else if (selectedService && startsAtValid) {
    step = 3;
  } else if (selectedService) {
    step = 2;
  }

  const slots =
    selectedService && step === 2
      ? await runWithTenantContext({ tenantId: tenant.id }, async () => {
          const rangeStart = new Date();
          const rangeEnd = new Date(rangeStart.getTime() + 7 * 24 * 60 * 60 * 1000);
          const existingBookings = await prisma.booking.findMany({
            where: {
              tenantId: tenant.id,
              serviceId: selectedService.id,
              status: { not: "cancelled" },
              startsAt: { lt: rangeEnd },
              endsAt: { gt: rangeStart },
            },
            select: { startsAt: true, endsAt: true },
          });

          return computeSlots(
            { durationMinutes: selectedService.durationMinutes },
            { start: rangeStart, end: rangeEnd },
            existingBookings,
            tenant.businessHours
          ).slice(0, 48);
        })
      : [];

  async function submitBooking(formData: FormData) {
    "use server";

    const formSlug = String(formData.get("slug") ?? "").trim().toLowerCase();
    const serviceId = String(formData.get("serviceId") ?? "").trim();
    const startsAt = String(formData.get("startsAt") ?? "").trim();
    const customerName = String(formData.get("customerName") ?? "").trim();
    const phone = String(formData.get("phone") ?? "").trim();
    const formSessionId = String(formData.get("sessionId") ?? "").trim() || randomUUID();

    const result = await createPublicBooking({
      slug: formSlug,
      serviceId,
      startsAt,
      customerName,
      phone,
      sessionId: formSessionId,
    });

    if (!result.ok) {
      redirect(
        bookPath(formSlug, {
          serviceId,
          startsAt,
          sessionId: formSessionId,
          error: result.error,
        })
      );
    }

    redirect(
      bookPath(formSlug, {
        done: "1",
        bookingId: result.booking.id,
        sessionId: result.sessionId,
      })
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-16 text-slate-100">
      <header className="space-y-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
          {tenant.name}
        </p>
        <h1 className="text-3xl font-semibold text-white md:text-4xl">Book an appointment</h1>
        <p className="max-w-2xl text-sm text-slate-300">
          Complete the steps below. Your selected time is held for 10 minutes after you confirm.
        </p>
        <StepperNav current={step} />
      </header>

      {searchParams.error ? (
        <p
          role="alert"
          className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200"
        >
          {searchParams.error === "slot_held"
            ? "That time was just held by someone else. Pick another slot."
            : searchParams.error === "invalid_phone"
              ? "Enter a valid Nigerian mobile number (e.g. 0803 123 4567)."
              : searchParams.error === "slot_unavailable"
                ? "That time is no longer available. Pick another slot."
                : "We could not complete your booking. Please try again."}
        </p>
      ) : null}

      {step === 1 ? (
        <section aria-labelledby="step-service" className="space-y-4">
          <h2 id="step-service" className="text-xl font-semibold text-white">
            1. Choose a service
          </h2>
          {tenant.services.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-sm text-slate-400">
              No services are available to book yet.
            </p>
          ) : (
            <ul className="grid gap-3">
              {tenant.services.map((service) => (
                <li key={service.id}>
                  <a
                    href={bookPath(slug, { serviceId: service.id, sessionId })}
                    className="block rounded-lg border border-slate-800 bg-slate-900/60 p-5 transition hover:border-emerald-500/50 hover:bg-slate-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-white">{service.name}</h3>
                      <p className="shrink-0 text-sm font-medium text-emerald-300">
                        {formatPrice(service.priceCents, service.currency || tenant.currency)}
                      </p>
                    </div>
                    {service.description ? (
                      <p className="mt-2 text-sm text-slate-300">{service.description}</p>
                    ) : null}
                    <p className="mt-3 text-xs uppercase tracking-wide text-slate-400">
                      {formatDuration(service.durationMinutes)}
                    </p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {step === 2 && selectedService ? (
        <section aria-labelledby="step-time" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="step-time" className="text-xl font-semibold text-white">
                2. Pick a time
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {selectedService.name} · times in {tenant.timezone}
              </p>
            </div>
            <a
              href={bookPath(slug, { sessionId })}
              className="text-sm font-medium text-emerald-300 hover:text-emerald-200"
            >
              Change service
            </a>
          </div>
          {slots.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-5 py-8 text-sm text-slate-400">
              No open slots in the next 7 days. Try another service or check back later.
            </p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {slots.map((slot) => {
                const iso = slot.startsAt.toISOString();
                return (
                  <li key={iso}>
                    <a
                      href={bookPath(slug, {
                        serviceId: selectedService.id,
                        startsAt: iso,
                        sessionId,
                      })}
                      className="block rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3 text-sm font-medium text-slate-100 transition hover:border-emerald-500/50 hover:bg-slate-900"
                    >
                      {formatSlotLabel(slot.startsAt, tenant.timezone)}
                    </a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {step === 3 && selectedService && startsAtValid && startsAtDate ? (
        <section aria-labelledby="step-details" className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="step-details" className="text-xl font-semibold text-white">
                3. Your details
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {selectedService.name} · {formatSlotLabel(startsAtDate, tenant.timezone)}
              </p>
            </div>
            <a
              href={bookPath(slug, { serviceId: selectedService.id, sessionId })}
              className="text-sm font-medium text-emerald-300 hover:text-emerald-200"
            >
              Change time
            </a>
          </div>

          <form
            action={submitBooking}
            className="space-y-4 rounded-lg border border-slate-800 bg-slate-900/60 p-5"
          >
            <input type="hidden" name="slug" value={slug} />
            <input type="hidden" name="serviceId" value={selectedService.id} />
            <input type="hidden" name="startsAt" value={startsAtDate.toISOString()} />
            <input type="hidden" name="sessionId" value={sessionId} />

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Full name</span>
              <input
                name="customerName"
                required
                autoComplete="name"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-500 focus:ring-2"
                placeholder="Ada Lovelace"
              />
            </label>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-slate-200">Nigerian mobile</span>
              <input
                name="phone"
                required
                autoComplete="tel"
                inputMode="tel"
                className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none ring-emerald-500 focus:ring-2"
                placeholder="0803 123 4567"
              />
            </label>

            <button
              type="submit"
              className="inline-flex w-full items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400"
            >
              Confirm booking
            </button>
          </form>
        </section>
      ) : null}

      {step === 4 ? (
        <section
          aria-labelledby="step-confirm"
          className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-6"
        >
          <h2 id="step-confirm" className="text-xl font-semibold text-white">
            Booking reserved
          </h2>
          <p className="text-sm text-slate-300">
            Your appointment is held with status <code className="text-emerald-300">pending_payment</code>
            . Complete payment within 10 minutes to keep this slot.
          </p>
          {searchParams.bookingId ? (
            <p className="text-xs text-slate-500">Reference: {searchParams.bookingId}</p>
          ) : null}
          <a
            href={`/${slug}`}
            className="inline-flex w-fit items-center justify-center rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
          >
            Back to {tenant.name}
          </a>
        </section>
      ) : null}

      <footer className="border-t border-slate-800 pt-6 text-sm text-slate-500">
        <a href={`/${slug}`} className="text-slate-400 hover:text-slate-200">
          ← {tenant.name}
        </a>
      </footer>
    </main>
  );
}
