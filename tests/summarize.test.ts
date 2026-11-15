import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeDay } from "../lib/calendar/summarize";
import type { CalendarEvent } from "../lib/calendar/types";

/** Build an event running from `startHour` to `endHour` UTC on a fixed day. */
function ev(
  id: string,
  startHour: number,
  endHour: number,
  overrides: Partial<CalendarEvent> = {},
): CalendarEvent {
  const at = (h: number) =>
    `2026-08-07T${String(h).padStart(2, "0")}:00:00.000Z`;

  return {
    id,
    title: id,
    start: at(startHour),
    end: at(endHour),
    isAllDay: false,
    showAs: "busy",
    isOnline: false,
    location: null,
    organizer: null,
    attendeeCount: 2,
    isCancelled: false,
    ...overrides,
  };
}

test("empty day has no load", () => {
  const day = summarizeDay([]);
  assert.equal(day.meetingCount, 0);
  assert.equal(day.meetingMinutes, 0);
  assert.equal(day.firstEventAt, null);
  assert.equal(day.lastEventAt, null);
});

test("double-booked meetings are not counted twice", () => {
  const day = summarizeDay([ev("a", 9, 11), ev("b", 10, 12)]);
  assert.equal(day.meetingMinutes, 180, "9-12 is three hours, not four");
});

test("adjacent meetings still count as back-to-back transitions", () => {
  // Regression: merging overlapping intervals for the volume total used to
  // collapse adjacent meetings into one block, hiding every transition.
  const day = summarizeDay([ev("a", 9, 10), ev("b", 10, 11), ev("c", 11, 12)]);
  assert.equal(day.meetingMinutes, 180);
  assert.equal(day.backToBackCount, 2);
  assert.equal(day.longestFocusBlockMinutes, 0);
});

test("gaps between meetings are measured", () => {
  const day = summarizeDay([ev("a", 9, 10), ev("b", 14, 15)]);
  assert.equal(day.longestFocusBlockMinutes, 240);
  assert.equal(day.backToBackCount, 0);
});

test("free, all-day and cancelled entries are excluded from load", () => {
  const free = summarizeDay([ev("a", 9, 10), ev("f", 11, 17, { showAs: "free" })]);
  assert.equal(free.meetingMinutes, 60);

  const allDay = summarizeDay([ev("a", 9, 10), ev("d", 0, 23, { isAllDay: true })]);
  assert.equal(allDay.meetingMinutes, 60);

  const cancelled = summarizeDay([
    ev("a", 9, 10),
    ev("x", 11, 13, { isCancelled: true }),
  ]);
  assert.equal(cancelled.meetingMinutes, 60);
});

test("events out of order are handled", () => {
  const day = summarizeDay([ev("late", 15, 16), ev("early", 9, 10)]);
  assert.equal(day.firstEventAt, "2026-08-07T09:00:00.000Z");
  assert.equal(day.lastEventAt, "2026-08-07T16:00:00.000Z");
  assert.equal(day.meetingMinutes, 120);
});

test("all events are retained for display even when excluded from load", () => {
  const day = summarizeDay([ev("a", 9, 10), ev("f", 11, 12, { showAs: "free" })]);
  assert.equal(day.events.length, 2);
  assert.equal(day.meetingCount, 1);
});
