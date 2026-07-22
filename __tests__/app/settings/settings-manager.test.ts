import { describe, expect, it } from "vitest";

import {
  validateAvailabilityForm,
  type BlackoutFormRow,
  type BusinessHourFormRow,
} from "@/app/(app)/settings/settings-manager";

const validHours: BusinessHourFormRow[] = [
  { id: "hour-1", dayOfWeek: "1", opensAt: "09:00", closesAt: "12:00" },
  { id: "hour-2", dayOfWeek: "1", opensAt: "13:00", closesAt: "17:00" },
];

const validBlackouts: BlackoutFormRow[] = [
  { id: "blackout-1", date: "2026-12-25", reason: "Holiday" },
];

describe("settings availability form helpers", () => {
  it("accepts multi-window weekdays and blackout dates", () => {
    expect(validateAvailabilityForm(validHours, validBlackouts)).toEqual({});
  });

  it("rejects windows that close before they open", () => {
    expect(
      validateAvailabilityForm(
        [{ id: "hour-1", dayOfWeek: "1", opensAt: "17:00", closesAt: "09:00" }],
        []
      )
    ).toEqual({ businessHours: "Close time must be after open time" });
  });

  it("rejects duplicate blackout dates", () => {
    expect(
      validateAvailabilityForm(validHours, [
        { id: "blackout-1", date: "2026-12-25", reason: "Holiday" },
        { id: "blackout-2", date: "2026-12-25", reason: "Maintenance" },
      ])
    ).toEqual({ blackouts: "Duplicate blackout dates are not allowed" });
  });
});
