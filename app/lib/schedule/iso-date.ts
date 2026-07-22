// Normalize and validate a blackout date value into the ISO YYYY-MM-DD wire
// format the Blackout table stores. Accepts:
//   - a Date instance — projected to UTC calendar parts (callers that need
//     wall-clock projection in a specific timezone must do that themselves;
//     Blackout dates are timezone-independent identifiers by design).
//   - a string that is already YYYY-MM-DD, or a longer ISO string whose date
//     prefix is well-formed (e.g. "2026-07-10T12:34:56Z").
// Any other shape throws — the API/model layer relies on this to keep
// database and response values in a single canonical form.
const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

export function normalizeIsoDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new Error("Invalid date: NaN timestamp");
    }
    const year = value.getUTCFullYear();
    const month = String(value.getUTCMonth() + 1).padStart(2, "0");
    const day = String(value.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value !== "string") {
    throw new Error(`Invalid date value: expected string or Date, got ${typeof value}`);
  }

  const prefix = value.length >= 10 ? value.slice(0, 10) : value;
  const match = YMD.exec(prefix);
  if (!match) {
    throw new Error(`Invalid date "${value}": expected YYYY-MM-DD`);
  }

  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  if (month < 1 || month > 12) {
    throw new Error(`Invalid date "${value}": month ${month} out of range`);
  }
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) {
    throw new Error(`Invalid date "${value}": day ${day} out of range for ${year}-${m}`);
  }

  return `${y}-${m}-${d}`;
}

export function isIsoDate(value: unknown): value is string {
  try {
    normalizeIsoDate(value);
    return true;
  } catch {
    return false;
  }
}
