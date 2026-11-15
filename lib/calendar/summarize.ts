import type { CalendarEvent, CalendarDay } from "./types";

/**
 * Turns a day's events into the load metrics the outlook score consumes.
 * Provider-neutral and pure — a Google or CalDAV source normalises into
 * CalendarEvent[] and reuses this unchanged.
 *
 * All-day entries, "free"-status holds and cancelled events are excluded:
 * none of them represent time somebody is actually taking from you.
 */
export function summarizeDay(events: CalendarEvent[]): CalendarDay {
  const meetings = events.filter(
    (e) => !e.isAllDay && e.showAs !== "free" && !e.isCancelled,
  );

  // Merge overlapping meetings so a double-booked slot is not counted twice.
  const intervals = meetings
    .map((e) => ({ start: Date.parse(e.start), end: Date.parse(e.end) }))
    .filter((i) => Number.isFinite(i.start) && Number.isFinite(i.end))
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const interval of intervals) {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  let meetingMinutes = 0;
  for (const block of merged) {
    meetingMinutes += Math.max(0, (block.end - block.start) / 60_000);
  }

  // Transitions are measured on the un-merged sequence: three adjacent
  // meetings merge into one block for the volume total, but they are still
  // two hand-offs with no break, which is what actually costs you.
  let backToBackCount = 0;
  let longestFocusBlockMinutes = 0;
  let runningEnd = intervals.length > 0 ? intervals[0].end : 0;

  for (let i = 1; i < intervals.length; i++) {
    const gapMinutes = (intervals[i].start - runningEnd) / 60_000;
    // A negative gap means the meetings overlap — no break either way.
    if (gapMinutes <= 5) backToBackCount++;
    if (gapMinutes > longestFocusBlockMinutes) {
      longestFocusBlockMinutes = gapMinutes;
    }
    runningEnd = Math.max(runningEnd, intervals[i].end);
  }

  return {
    events,
    meetingCount: meetings.length,
    meetingMinutes: Math.round(meetingMinutes),
    firstEventAt: merged.length > 0 ? new Date(merged[0].start).toISOString() : null,
    lastEventAt:
      merged.length > 0
        ? new Date(merged[merged.length - 1].end).toISOString()
        : null,
    longestFocusBlockMinutes: Math.round(longestFocusBlockMinutes),
    backToBackCount,
  };
}
