import { describe, expect, it } from "vitest";

import {
  koboToNairaInput,
  nairaInputToKobo,
  serviceToForm,
  validateServiceForm,
  type ServiceFormState,
} from "@/app/(app)/services/services-manager";

const validForm: ServiceFormState = {
  name: "Classic Haircut",
  durationMinutes: "45",
  priceNaira: "7500",
  bufferMinutes: "10",
  active: true,
};

describe("services manager form helpers", () => {
  it("converts naira input into integer kobo for API payloads", () => {
    expect(nairaInputToKobo("7500")).toBe(750000);
    expect(nairaInputToKobo("1250.50")).toBe(125050);
  });

  it("formats stored kobo values for editing in naira", () => {
    expect(koboToNairaInput(750000)).toBe("7500");
    expect(koboToNairaInput(125050)).toBe("1250.50");
  });

  it("returns inline field errors for invalid form values", () => {
    const errors = validateServiceForm({
      name: " ",
      durationMinutes: "0",
      priceNaira: "-1",
      bufferMinutes: "-5",
      active: true,
    });

    expect(errors).toEqual({
      name: "Name is required",
      durationMinutes: "Duration must be at least 1 minute",
      priceNaira: "Price cannot be negative",
      bufferMinutes: "Buffer cannot be negative",
    });
  });

  it("accepts valid service form values", () => {
    expect(validateServiceForm(validForm)).toEqual({});
  });

  it("maps an existing service into editable form values", () => {
    expect(
      serviceToForm({
        id: "service-1",
        name: "Beard Trim",
        durationMinutes: 20,
        priceKobo: 350000,
        bufferMinutes: 5,
        active: false,
      })
    ).toEqual({
      name: "Beard Trim",
      durationMinutes: "20",
      priceNaira: "3500",
      bufferMinutes: "5",
      active: false,
    });
  });
});
