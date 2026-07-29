"use client";

type BookingService = {
  id: string;
  name: string;
  durationMinutes: number;
  priceKobo: number;
  active: boolean;
};

type BookingServiceListProps = {
  services: BookingService[];
  selectedServiceId?: string | null;
  onSelect(serviceId: string): void;
};

export function getActiveBookingServices(services: BookingService[]) {
  return services.filter((service) => service.active);
}

function formatNaira(priceKobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(priceKobo / 100);
}

export function BookingServiceList({
  services,
  selectedServiceId,
  onSelect,
}: BookingServiceListProps) {
  const activeServices = getActiveBookingServices(services);

  if (activeServices.length === 0) {
    return <p className="text-sm text-slate-400">No services are available for booking.</p>;
  }

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-slate-100">Choose a service</legend>
      <ul className="grid gap-3 sm:grid-cols-2">
        {activeServices.map((service) => {
          const isSelected = selectedServiceId === service.id;

          return (
            <li key={service.id}>
              <button
                aria-pressed={isSelected}
                className={[
                  "w-full rounded-md border px-4 py-3 text-left text-sm transition",
                  isSelected
                    ? "border-emerald-400 bg-emerald-950/40 text-white"
                    : "border-slate-800 bg-slate-900 text-slate-200 hover:border-emerald-400",
                ].join(" ")}
                type="button"
                onClick={() => onSelect(service.id)}
              >
                <span className="block font-medium">{service.name}</span>
                <span className="mt-1 block text-xs text-slate-400">
                  {service.durationMinutes} min - {formatNaira(service.priceKobo)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
