import { getOpenWindows, type OpenWindow } from "@/app/lib/availability/open-windows";

export type AvailabilityWindow = OpenWindow & {
  date: string;
};

export type AvailabilityEngineOptions = {
  tenantId: string;
  date: Date | string;
};

export async function getAvailabilityWindows({
  tenantId,
  date,
}: AvailabilityEngineOptions): Promise<AvailabilityWindow[]> {
  const windows = await getOpenWindows(tenantId, date);
  const localDate = typeof date === "string" ? date : date.toISOString().slice(0, 10);

  return windows.map((window) => ({
    date: localDate,
    opensAt: window.opensAt,
    closesAt: window.closesAt,
  }));
}
