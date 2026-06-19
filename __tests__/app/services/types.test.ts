import { describe, expect, it } from "vitest";
import {
  emptyForm,
  formFromService,
  formToPayload,
  formatKobo,
  type ServiceDto,
} from "@/app/services/types";

const SERVICE: ServiceDto = {
  id: "svc_1",
  name: "Haircut",
  durationMinutes: 30,
  priceKobo: 250000,
  active: true,
  createdAt: "2026-06-19T10:00:00.000Z",
  updatedAt: "2026-06-19T10:00:00.000Z",
};

describe("services form helpers", () => {
  it("emptyForm uses sensible defaults", () => {
    expect(emptyForm.name).toBe("");
    expect(emptyForm.durationMinutes).toBe("30");
    expect(emptyForm.priceKobo).toBe("0");
    expect(emptyForm.bufferMinutes).toBe("0");
    expect(emptyForm.active).toBe(true);
  });

  it("formFromService hydrates string-typed form values from a dto", () => {
    const form = formFromService(SERVICE);
    expect(form.name).toBe("Haircut");
    expect(form.durationMinutes).toBe("30");
    expect(form.priceKobo).toBe("250000");
    expect(form.active).toBe(true);
  });

  it("formToPayload coerces numeric strings and trims name", () => {
    const payload = formToPayload({
      name: "  Massage  ",
      durationMinutes: "45",
      priceKobo: "750000",
      bufferMinutes: "10",
      active: false,
    });
    expect(payload).toEqual({
      name: "Massage",
      durationMinutes: 45,
      priceKobo: 750000,
      bufferMinutes: 10,
      active: false,
    });
  });

  it("formatKobo formats as NGN with two fraction digits", () => {
    const out = formatKobo(250000);
    expect(out).toMatch(/2,500\.00/);
  });
});
