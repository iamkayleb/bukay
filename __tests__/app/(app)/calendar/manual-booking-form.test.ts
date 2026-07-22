import { describe, expect, it } from "vitest";

import {
  buildManualBookingPayload,
  emptyManualBookingForm,
  filterClients,
  validateManualBookingForm,
  type ClientOption,
  type ServiceOption,
} from "@/app/(app)/calendar/manual-booking-form";

const clients: ClientOption[] = [
  { id: "client-1", name: "Ada Okafor", phone: "+2348011111111", email: "ada@example.com" },
  { id: "client-2", name: "Bola Mensah", phone: "+2348022222222", email: null },
];

const services: ServiceOption[] = [
  { id: "service-1", name: "Classic Haircut", durationMinutes: 45 },
  { id: "service-2", name: "Beard Trim", durationMinutes: 20 },
];

describe("manual booking form helpers", () => {
  it("filters clients by name, phone, or email", () => {
    expect(filterClients("ada", clients)).toEqual([clients[0]]);
    expect(filterClients("2222", clients)).toEqual([clients[1]]);
    expect(filterClients("example.com", clients)).toEqual([clients[0]]);
    expect(filterClients(" ", clients)).toEqual(clients);
  });

  it("requires an existing client, service, and slot", () => {
    expect(validateManualBookingForm(emptyManualBookingForm, services)).toEqual({
      selectedClientId: "Choose a client",
      serviceId: "Choose a service",
      startsAt: "Choose a valid slot",
    });
  });

  it("requires inline client details when creating a new client", () => {
    expect(
      validateManualBookingForm(
        {
          ...emptyManualBookingForm,
          clientMode: "new",
          newClientEmail: "not-an-email",
          serviceId: "service-1",
          startsAt: "2026-07-22T10:00",
        },
        services
      )
    ).toEqual({
      newClientName: "Client name is required",
      newClientPhone: "Phone is required",
      newClientEmail: "Enter a valid email",
    });
  });

  it("builds an existing-client booking payload with service duration", () => {
    expect(
      buildManualBookingPayload(
        {
          ...emptyManualBookingForm,
          selectedClientId: "client-1",
          serviceId: "service-1",
          startsAt: "2026-07-22T10:00",
          notes: "  Prefers morning slots  ",
        },
        services
      )
    ).toEqual({
      client: { id: "client-1" },
      serviceId: "service-1",
      startsAt: "2026-07-22T10:00:00.000Z",
      endsAt: "2026-07-22T10:45:00.000Z",
      notes: "Prefers morning slots",
    });
  });

  it("builds an inline-created client payload", () => {
    expect(
      buildManualBookingPayload(
        {
          ...emptyManualBookingForm,
          clientMode: "new",
          newClientName: "  Ada Okafor  ",
          newClientPhone: " +2348011111111 ",
          newClientEmail: "",
          serviceId: "service-2",
          startsAt: "2026-07-22T11:00",
        },
        services
      )
    ).toMatchObject({
      client: {
        name: "Ada Okafor",
        phone: "+2348011111111",
        email: null,
      },
      serviceId: "service-2",
      endsAt: "2026-07-22T11:20:00.000Z",
      notes: null,
    });
  });
});
