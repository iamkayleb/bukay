import { prisma } from "@/app/db/prisma";

export type OpenWindow = {
  opensAt: string;
  closesAt: string;
};

type BusinessHourRecord = {
  opensAt: string;
  closesAt: string;
};

type BlackoutRecord = {
  id: string;
};

type AvailabilityPrisma = {
  businessHour: {
    findMany(args: unknown): Promise<BusinessHourRecord[]>;
  };
  blackout: {
    findFirst(args: unknown): Promise<BlackoutRecord | null>;
  };
};

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WALL_CLOCK_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toTenantLocalDate(value: Date | string): string {
  if (typeof value === "string") {
    if (!LOCAL_DATE_PATTERN.test(value)) {
      throw new Error("date must use YYYY-MM-DD format");
    }

    return value;
  }

  return value.toISOString().slice(0, 10);
}

export function dayOfWeekForLocalDate(localDate: string): number {
  if (!LOCAL_DATE_PATTERN.test(localDate)) {
    throw new Error("date must use YYYY-MM-DD format");
  }

  return new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
}

function isValidOpenWindow(window: BusinessHourRecord): window is OpenWindow {
  return (
    WALL_CLOCK_PATTERN.test(window.opensAt) &&
    WALL_CLOCK_PATTERN.test(window.closesAt) &&
    window.opensAt < window.closesAt
  );
}

export async function getOpenWindows(
  tenantId: string,
  date: Date | string,
  db: AvailabilityPrisma = prisma as unknown as AvailabilityPrisma
): Promise<OpenWindow[]> {
  const normalizedTenantId = tenantId.trim();
  if (!normalizedTenantId) {
    throw new Error("tenantId is required");
  }

  const localDate = toTenantLocalDate(date);
  const blackout = await db.blackout.findFirst({
    where: {
      tenantId: normalizedTenantId,
      date: localDate,
    },
    select: { id: true },
  });

  if (blackout) {
    return [];
  }

  const businessHours = await db.businessHour.findMany({
    where: {
      tenantId: normalizedTenantId,
      dayOfWeek: dayOfWeekForLocalDate(localDate),
    },
    orderBy: [{ opensAt: "asc" }, { closesAt: "asc" }],
    select: {
      opensAt: true,
      closesAt: true,
    },
  });

  return businessHours.filter(isValidOpenWindow).map((window) => ({
    opensAt: window.opensAt,
    closesAt: window.closesAt,
  }));
}
