export const weekdays = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export type Weekday = (typeof weekdays)[number];

export type DailyOpenWindow = {
  start: string;
  end: string;
};

export type OpenWindowsConfig = {
  weekdayHours: Partial<Record<Weekday, DailyOpenWindow[]>>;
  blackoutDates?: string[];
};

export type OpenWindow = {
  date: string;
  weekday: Weekday;
  start: string;
  end: string;
  startsAt: string;
  endsAt: string;
};

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function getOpenWindows(date: Date | string, config: OpenWindowsConfig): OpenWindow[] {
  const dateKey = formatDateKey(date);

  if (config.blackoutDates?.includes(dateKey)) {
    return [];
  }

  const weekday = weekdays[getUtcWeekdayIndex(dateKey)];
  const hours = config.weekdayHours[weekday] ?? [];

  return hours.map((window) => createOpenWindow(dateKey, weekday, window));
}

function createOpenWindow(date: string, weekday: Weekday, window: DailyOpenWindow): OpenWindow {
  assertValidTime(window.start, "start");
  assertValidTime(window.end, "end");

  if (minutesSinceMidnight(window.end) <= minutesSinceMidnight(window.start)) {
    throw new Error(`Open window end time must be after start time for ${date}`);
  }

  return {
    date,
    weekday,
    start: window.start,
    end: window.end,
    startsAt: `${date}T${window.start}:00.000Z`,
    endsAt: `${date}T${window.end}:00.000Z`,
  };
}

function formatDateKey(date: Date | string): string {
  if (date instanceof Date) {
    if (Number.isNaN(date.getTime())) {
      throw new Error("Date must be valid");
    }

    return date.toISOString().slice(0, 10);
  }

  if (!DATE_PATTERN.test(date)) {
    throw new Error("Date string must use YYYY-MM-DD format");
  }

  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) {
    throw new Error("Date string must be a valid calendar date");
  }

  return date;
}

function getUtcWeekdayIndex(date: string): number {
  const weekdayDate = new Date(`${date}T00:00:00.000Z`);
  return weekdayDate.getUTCDay();
}

function assertValidTime(value: string, fieldName: string) {
  if (!TIME_PATTERN.test(value)) {
    throw new Error(`Open window ${fieldName} time must use HH:mm 24-hour format`);
  }
}

function minutesSinceMidnight(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}
