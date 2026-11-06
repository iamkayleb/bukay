export function dateInZone(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
// Resolve midnights separately to support daylight saving transitions.
export function calendarDayRange(date: string, timeZone: string) {
  function midnight(utc: number) {
    let result = utc;
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(result)).map((p) => [p.type, p.value])
      );
      result +=
        utc -
        Date.UTC(
          +parts.year,
          +parts.month - 1,
          +parts.day,
          +parts.hour,
          +parts.minute,
          +parts.second
        );
    }
    return new Date(result);
  }
  const utc = new Date(`${date}T00:00:00Z`).getTime();
  return { start: midnight(utc), end: midnight(utc + 86400000) };
}
