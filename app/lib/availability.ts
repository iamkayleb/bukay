import { prisma } from "@/app/db/prisma";

export type OpenWindow = {
  opensAt: string;
  closesAt: string;
};

type BusinessHourRecord = {
  opensAt: string;
  closesAt: string;
};

type AvailabilityDelegate = {
  businessHour: {
    findMany(args: unknown): Promise<BusinessHourRecord[]>;
  };
  blackout: {
    findUnique(args: unknown): Promise<{ id: string } | null>;
  };
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function toLocalDateKey(date: Date | string) {
  if (typeof date === "string") {
    const trimmed = date.trim();
    if (!DATE_PATTERN.test(trimmed)) {
      throw new Error("Availability date must use YYYY-MM-DD format");
    }
    return trimmed;
  }

  return date.toISOString().slice(0, 10);
}

export function dayOfWeekFromDateKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

export async function getOpenWindows(
  tenantId: string,
  date: Date | string,
  delegate: AvailabilityDelegate = prisma as unknown as AvailabilityDelegate
): Promise<OpenWindow[]> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) {
    throw new Error("tenantId is required");
  }

  const dateKey = toLocalDateKey(date);
  const blackout = await delegate.blackout.findUnique({
    where: { tenantId_date: { tenantId: normalizedTenantId, date: dateKey } },
    select: { id: true },
  });

  if (blackout) {
    return [];
  }

  const businessHours = await delegate.businessHour.findMany({
    where: {
      tenantId: normalizedTenantId,
      dayOfWeek: dayOfWeekFromDateKey(dateKey),
    },
    orderBy: [{ opensAt: "asc" }, { closesAt: "asc" }],
  });

  return businessHours.map((window) => ({
    opensAt: window.opensAt,
    closesAt: window.closesAt,
  }));
}
