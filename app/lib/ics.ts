export const ICS_CONTENT_TYPE = "text/calendar; charset=utf-8";

const ICS_LINE_BREAK = "\r\n";
const FOLD_WIDTH = 75;

export type IcsEvent = {
  uid: string;
  startsAt: Date;
  endsAt: Date;
  summary: string;
  description?: string;
  location?: string;
};

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

function formatIcsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

// RFC 5545 §3.1 requires content lines to be folded at 75 octets, with each
// continuation line starting with a single space, or Google Calendar's
// importer truncates long SUMMARY/DESCRIPTION values.
function foldLine(line: string): string {
  if (line.length <= FOLD_WIDTH) {
    return line;
  }

  const parts = [line.slice(0, FOLD_WIDTH)];
  let rest = line.slice(FOLD_WIDTH);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, FOLD_WIDTH - 1));
    rest = rest.slice(FOLD_WIDTH - 1);
  }
  return parts.join(ICS_LINE_BREAK);
}

export function buildBookingIcs(event: IcsEvent): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Bukay//Booking Confirmation//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(event.startsAt)}`,
    `DTEND:${formatIcsDate(event.endsAt)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.map(foldLine).join(ICS_LINE_BREAK) + ICS_LINE_BREAK;
}
