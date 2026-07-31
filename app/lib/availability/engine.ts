import {
  getOpenWindows,
  type OpenWindow,
  type OpenWindowsConfig,
} from "@/app/lib/availability/open-windows";

export type AvailabilityQuery = {
  startDate: Date | string;
  days?: number;
};

export type AvailabilityEngineConfig = OpenWindowsConfig;

export function getAvailabilityWindows(
  query: AvailabilityQuery,
  config: AvailabilityEngineConfig
): OpenWindow[] {
  const days = query.days ?? 1;
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("Availability query days must be a positive integer");
  }

  return Array.from({ length: days }, (_, offset) =>
    getOpenWindows(addUtcDays(query.startDate, offset), config)
  ).flat();
}

function addUtcDays(date: Date | string, days: number): string {
  const dateKey = toUtcDateKey(date);
  const nextDate = new Date(`${dateKey}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate.toISOString().slice(0, 10);
}

function toUtcDateKey(date: Date | string): string {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) {
      throw new Error("Date must be valid");
    }

    return date.toISOString().slice(0, 10);
  }

  return date;
}
