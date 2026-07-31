export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const DEFAULT_WEEKDAY: Weekday = 0;

// Locales where the ISO/CLDR convention is Monday-first. This isn't exhaustive,
// but it covers the buckets we need to distinguish today. Extend as needed.
const MONDAY_START_LOCALES = new Set([
  "en-GB",
  "en-IE",
  "en-AU",
  "en-NZ",
  "de",
  "de-DE",
  "de-AT",
  "de-CH",
  "fr",
  "fr-FR",
  "fr-CA",
  "es",
  "es-ES",
  "it",
  "it-IT",
  "nl",
  "nl-NL",
  "pt",
  "pt-PT",
  "sv",
  "sv-SE",
  "no",
  "nb",
  "nb-NO",
  "da",
  "da-DK",
  "fi",
  "fi-FI",
  "pl",
  "pl-PL",
  "ru",
  "ru-RU",
  "cs",
  "cs-CZ",
  "sk",
  "sk-SK",
  "hu",
  "hu-HU",
  "ro",
  "ro-RO",
  "tr",
  "tr-TR",
]);

const SATURDAY_START_LOCALES = new Set([
  "ar",
  "ar-SA",
  "ar-EG",
  "he",
  "he-IL",
  "fa",
  "fa-IR",
]);

export function resolveWeekStart(locale?: string | null): Weekday {
  if (!locale) return DEFAULT_WEEKDAY;
  const normalized = locale.trim();
  if (!normalized) return DEFAULT_WEEKDAY;

  if (MONDAY_START_LOCALES.has(normalized)) return 1;
  if (SATURDAY_START_LOCALES.has(normalized)) return 6;

  const [primary] = normalized.split("-");
  if (primary && primary !== normalized) {
    if (MONDAY_START_LOCALES.has(primary)) return 1;
    if (SATURDAY_START_LOCALES.has(primary)) return 6;
  }

  return DEFAULT_WEEKDAY;
}

export function startOfDay(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function startOfWeek(date: Date, weekStartsOn: Weekday = DEFAULT_WEEKDAY): Date {
  const copy = startOfDay(date);
  const weekday = copy.getDay();
  const offset = (weekday - weekStartsOn + 7) % 7;
  copy.setDate(copy.getDate() - offset);
  return copy;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}
