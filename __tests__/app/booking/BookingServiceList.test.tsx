import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BookingServiceList, getActiveBookingServices } from "@/app/booking/BookingServiceList";

const services = [
  {
    id: "service-1",
    name: "Haircut",
    durationMinutes: 45,
    priceKobo: 750000,
    active: true,
  },
  {
    id: "service-2",
    name: "Archived massage",
    durationMinutes: 60,
    priceKobo: 1200000,
    active: false,
  },
];

describe("BookingServiceList", () => {
  it("returns only active services for booking selection", () => {
    expect(getActiveBookingServices(services)).toEqual([services[0]]);
  });

  it("does not render archived services as selectable options", () => {
    const html = renderToStaticMarkup(
      <BookingServiceList services={services} selectedServiceId={null} onSelect={() => {}} />
    );

    expect(html).toContain("Haircut");
    expect(html).not.toContain("Archived massage");
    expect(html).not.toContain("service-2");
  });
});
