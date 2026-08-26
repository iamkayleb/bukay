import { describe, it, expect } from "vitest";
import {
  renderBookingConfirmedTemplate,
  renderBookingRescheduledTemplate,
  renderBookingCancelledTemplate,
  type BookingEmailContext,
} from "@/app/lib/email/templates";

const startsAt = new Date("2026-08-15T14:30:00.000Z");

function baseContext(overrides: Partial<BookingEmailContext> = {}): BookingEmailContext {
  return {
    tenantName: "Acme Salon",
    timezone: "Africa/Lagos",
    serviceName: "Haircut",
    staffName: "Alice",
    clientName: "Jordan",
    clientEmail: "jordan@example.com",
    startsAt,
    ...overrides,
  };
}

describe("renderBookingConfirmedTemplate", () => {
  it("includes tenant name, service, staff, and the local time for Africa/Lagos", () => {
    const rendered = renderBookingConfirmedTemplate(baseContext({ timezone: "Africa/Lagos" }));

    expect(rendered.templateId).toBe("booking-confirmed-v1");
    expect(rendered.subject).toContain("Acme Salon");
    expect(rendered.text).toContain("Acme Salon");
    expect(rendered.text).toContain("Haircut");
    expect(rendered.text).toContain("Alice");
    expect(rendered.text).toContain("Africa/Lagos");
    // Africa/Lagos is UTC+1 year-round, so 14:30 UTC renders as 3:30 PM.
    expect(rendered.text).toContain("3:30");
    expect(rendered.html).toContain("Acme Salon");
  });

  it("renders a distinct local time for America/New_York", () => {
    const rendered = renderBookingConfirmedTemplate(
      baseContext({ timezone: "America/New_York" }),
    );

    // America/New_York is UTC-4 in August (daylight saving), so 14:30 UTC is 10:30 AM.
    expect(rendered.text).toContain("10:30");
    expect(rendered.text).toContain("America/New_York");
  });

  it("omits the staff clause when no staff is assigned", () => {
    const rendered = renderBookingConfirmedTemplate(baseContext({ staffName: null }));
    expect(rendered.text).not.toContain(" with ");
  });
});

describe("renderBookingRescheduledTemplate", () => {
  it("mentions both the new and previous local times", () => {
    const previousStartsAt = new Date("2026-08-10T09:00:00.000Z");
    const rendered = renderBookingRescheduledTemplate(
      baseContext({ timezone: "Asia/Tokyo", previousStartsAt }),
    );

    expect(rendered.templateId).toBe("booking-rescheduled-v1");
    // Asia/Tokyo is UTC+9, so 14:30 UTC is 11:30 PM and 09:00 UTC is 6:00 PM.
    expect(rendered.text).toContain("11:30");
    expect(rendered.text).toContain("previously");
    expect(rendered.text).toContain("6:00");
  });

  it("omits the previous-time parenthetical when none is given", () => {
    const rendered = renderBookingRescheduledTemplate(baseContext({ timezone: "Africa/Lagos" }));
    expect(rendered.text).not.toContain("previously");
  });
});

describe("renderBookingCancelledTemplate", () => {
  it("renders the cancelled appointment's local time for the tenant's timezone", () => {
    const rendered = renderBookingCancelledTemplate(baseContext({ timezone: "America/New_York" }));

    expect(rendered.templateId).toBe("booking-cancelled-v1");
    expect(rendered.subject).toContain("cancelled");
    expect(rendered.text).toContain("10:30");
    expect(rendered.text).toContain("cancelled");
  });
});
