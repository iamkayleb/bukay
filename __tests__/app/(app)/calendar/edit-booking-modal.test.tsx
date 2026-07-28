import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { EditBookingModal } from "@/app/(app)/calendar/components/edit-booking-modal";

describe("EditBookingModal SSR", () => {
  const services = [
    { id: "svc-1", name: "Haircut", durationMinutes: 30, active: true },
    { id: "svc-2", name: "Colour", durationMinutes: 60, active: true },
    { id: "svc-inactive", name: "Retired", durationMinutes: 30, active: false },
  ];

  it("renders nothing when there is no booking", () => {
    const html = renderToStaticMarkup(
      <EditBookingModal
        booking={null}
        services={services}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    );
    expect(html).toBe("");
  });

  it("renders service, status, notes fields when a booking is provided", () => {
    const html = renderToStaticMarkup(
      <EditBookingModal
        booking={{
          id: "booking-1",
          serviceId: "svc-1",
          staffId: "staff-1",
          clientId: "client-1",
          startsAt: "2026-07-15T10:00:00.000Z",
          endsAt: "2026-07-15T10:30:00.000Z",
          notes: "Bring towels",
          status: "confirmed",
          clientName: "Ada",
          staffName: "Alice",
        }}
        services={services}
        onClose={() => {}}
        onSave={async () => {}}
      />,
    );
    expect(html).toContain("Edit booking");
    expect(html).toContain("Ada");
    expect(html).toContain("Alice");
    expect(html).toContain("Haircut");
    expect(html).toContain("confirmed");
    expect(html).toContain("Bring towels");
    // Inactive service shouldn't leak into the dropdown unless it's the current one
    expect(html).not.toContain("Retired");
  });
});
