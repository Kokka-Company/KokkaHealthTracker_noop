/**
 * Timezone-aware day boundaries, built on Intl so we do not pull in a date
 * library. "Today" has to mean today *where the user is* — a sync that runs at
 * 00:30 local should not fetch yesterday's recovery.
 */

/** Milliseconds that `timeZone` is ahead of UTC at the given instant. */
function offsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  // Intl renders midnight as hour 24 in some locales/zones.
  const hour = get("hour") % 24;

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    hour,
    get("minute"),
    get("second"),
  );

  return asUtc - date.getTime();
}

/** Current calendar date in `timeZone`, as YYYY-MM-DD. */
export function todayInZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The UTC instant of local midnight starting `dateStr` (YYYY-MM-DD).
 * Applies the offset twice so DST transition days land correctly.
 */
export function zonedDayStart(dateStr: string, timeZone: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0);

  const firstGuess = new Date(naive - offsetMs(new Date(naive), timeZone));
  return new Date(naive - offsetMs(firstGuess, timeZone));
}

/** The UTC instant of local midnight ending `dateStr`. */
export function zonedDayEnd(dateStr: string, timeZone: string): Date {
  const start = zonedDayStart(dateStr, timeZone);
  const nextDay = new Date(start.getTime() + 26 * 60 * 60 * 1000);
  return zonedDayStart(todayInZone(timeZone, nextDay), timeZone);
}

export function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Formats an ISO instant as a local clock time, e.g. "9:30 AM". */
export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** Formats YYYY-MM-DD as e.g. "Friday, August 7". */
export function formatDayLabel(dateStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day, 12)));
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/** A list of Intl-supported timezone names, for the settings picker. */
export function supportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  return intl.supportedValuesOf?.("timeZone") ?? ["UTC"];
}
