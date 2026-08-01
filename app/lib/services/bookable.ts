// Client helper for booking surfaces that need the tenant's bookable services.
//
// Every consumer that surfaces services to end users booking an appointment
// (calendar picker, public schedule, future client-facing booking form) MUST
// use this helper rather than fetching `/api/services` directly. It hardcodes
// the `?active=true` filter so archived services can never leak into a booking
// UI — see docs/DATA_MODEL.md → Service for the full contract.

export type BookableService = {
  id: string;
  tenantId: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  bufferMinutes: number;
  active: true;
};

type ServicesResponse = {
  ok: boolean;
  error?: string;
  services?: Array<Omit<BookableService, "active"> & { active: boolean }>;
};

export const BOOKABLE_SERVICES_PATH = "/api/services?active=true";

export async function fetchBookableServices(
  fetchImpl: typeof fetch = fetch
): Promise<BookableService[]> {
  const response = await fetchImpl(BOOKABLE_SERVICES_PATH, {
    headers: { Accept: "application/json" },
  });
  const data = (await response.json()) as ServicesResponse;

  if (!response.ok || !data.ok || !Array.isArray(data.services)) {
    throw new Error(data.error ?? "Unable to load bookable services");
  }

  // Belt-and-braces: the API already filters by active=true, but callers
  // should never see an archived row even if the backend is misconfigured.
  return data.services.filter((service): service is BookableService => service.active === true);
}
