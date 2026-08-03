import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  bookingDraftStorageKey,
  buildAvailableSlots,
  buildPublicBookingPayload,
  canProceedFromStep,
  emptyPublicBookingDraft,
  firstIncompleteBookingStep,
  nextBookingStep,
  previousBookingStep,
  PublicBookingFlow,
  type PublicBookingDraft,
  type PublicBookingService,
} from "@/app/[slug]/book/public-booking-flow";

const services: PublicBookingService[] = [
  {
    id: "service-1",
    name: "Classic Cut",
    durationMinutes: 60,
    priceCents: 750000,
    currency: "NGN",
  },
];

const completeDraft: PublicBookingDraft = {
  serviceId: "service-1",
  date: "2026-08-10",
  slot: "09:00",
  customerName: "Ada Lovelace",
  customerPhone: "+2348012345678",
  customerEmail: "ada@example.com",
  notes: "Window seat",
};

describe("public booking flow helpers", () => {
  it("renders the public multi-step booking UI with service selection and summary", () => {
    const html = renderToStaticMarkup(
      createElement(PublicBookingFlow, {
        services,
        tenantName: "Demo Salon",
        tenantSlug: "demo",
      })
    );

    expect(html).toContain("Demo Salon");
    expect(html).toContain("Book an appointment");
    expect(html).toContain("Service");
    expect(html).toContain("Date");
    expect(html).toContain("Time");
    expect(html).toContain("Details");
    expect(html).toContain("Confirm");
    expect(html).toContain("Choose a service");
    expect(html).toContain("Classic Cut");
    expect(html).toContain("Summary");
  });

  it("advances and reverses through the booking steps in order", () => {
    expect(nextBookingStep("service")).toBe("date");
    expect(nextBookingStep("date")).toBe("slot");
    expect(nextBookingStep("slot")).toBe("details");
    expect(nextBookingStep("details")).toBe("confirm");
    expect(nextBookingStep("confirm")).toBe("confirm");

    expect(previousBookingStep("confirm")).toBe("details");
    expect(previousBookingStep("service")).toBe("service");
  });

  it("requires each step's selection before continuing", () => {
    expect(canProceedFromStep("service", emptyPublicBookingDraft, services)).toBe(false);
    expect(
      canProceedFromStep(
        "service",
        {
          ...emptyPublicBookingDraft,
          serviceId: "missing-service",
        },
        services
      )
    ).toBe(false);
    expect(canProceedFromStep("service", completeDraft, services)).toBe(true);
    expect(canProceedFromStep("date", { ...completeDraft, date: "" }, services)).toBe(false);
    expect(canProceedFromStep("slot", { ...completeDraft, slot: "" }, services)).toBe(false);
    expect(canProceedFromStep("details", { ...completeDraft, customerPhone: " " }, services)).toBe(
      false
    );
  });

  it("restores a saved draft to the first incomplete booking step", () => {
    expect(firstIncompleteBookingStep(emptyPublicBookingDraft, services)).toBe("service");
    expect(firstIncompleteBookingStep({ ...completeDraft, slot: "" }, services)).toBe("slot");
    expect(firstIncompleteBookingStep({ ...completeDraft, customerName: "" }, services)).toBe(
      "details"
    );
    expect(firstIncompleteBookingStep(completeDraft, services)).toBe("confirm");
  });

  it("returns to service selection when a saved service is no longer available", () => {
    expect(firstIncompleteBookingStep(completeDraft, [])).toBe("service");
  });

  it("builds bookable slots from service duration", () => {
    expect(buildAvailableSlots("2026-08-10", services[0])).toEqual([
      "09:00",
      "10:00",
      "11:00",
      "12:00",
      "13:00",
      "14:00",
      "15:00",
      "16:00",
    ]);
  });

  it("builds the public booking API payload from the confirm step draft", () => {
    expect(buildPublicBookingPayload("demo", completeDraft, services)).toEqual({
      tenantSlug: "demo",
      serviceId: "service-1",
      startsAt: "2026-08-10T09:00:00.000Z",
      endsAt: "2026-08-10T10:00:00.000Z",
      client: {
        name: "Ada Lovelace",
        phone: "+2348012345678",
        email: "ada@example.com",
      },
      notes: "Window seat",
    });
  });

  it("returns null when the draft is missing required scheduling data", () => {
    expect(
      buildPublicBookingPayload("demo", { ...completeDraft, serviceId: "" }, services)
    ).toBeNull();
    expect(buildPublicBookingPayload("demo", { ...completeDraft, date: "" }, services)).toBeNull();
    expect(buildPublicBookingPayload("demo", { ...completeDraft, slot: "" }, services)).toBeNull();
  });

  it("scopes persisted draft state to the tenant slug", () => {
    expect(bookingDraftStorageKey("demo")).toBe("bukay:demo:booking-draft");
    expect(bookingDraftStorageKey("lagos-salon")).toBe("bukay:lagos-salon:booking-draft");
  });
});
