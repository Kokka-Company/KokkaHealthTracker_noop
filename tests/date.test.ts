import { test } from "node:test";
import assert from "node:assert/strict";
import {
  todayInZone,
  zonedDayStart,
  zonedDayEnd,
  addDays,
  formatDuration,
} from "../lib/date";

const HOUR = 3_600_000;

test("a zoned day starts at local midnight", () => {
  // 2026-08-07 is EDT (UTC-4), so local midnight is 04:00Z.
  const start = zonedDayStart("2026-08-07", "America/New_York");
  assert.equal(start.toISOString(), "2026-08-07T04:00:00.000Z");
});

test("an ordinary day is 24 hours long", () => {
  const start = zonedDayStart("2026-08-07", "America/New_York");
  const end = zonedDayEnd("2026-08-07", "America/New_York");
  assert.equal(end.getTime() - start.getTime(), 24 * HOUR);
});

test("DST spring-forward gives a 23-hour day", () => {
  const start = zonedDayStart("2026-03-08", "America/New_York");
  const end = zonedDayEnd("2026-03-08", "America/New_York");
  assert.equal(end.getTime() - start.getTime(), 23 * HOUR);
});

test("DST fall-back gives a 25-hour day", () => {
  const start = zonedDayStart("2026-11-01", "America/New_York");
  const end = zonedDayEnd("2026-11-01", "America/New_York");
  assert.equal(end.getTime() - start.getTime(), 25 * HOUR);
});

test("zones ahead of UTC resolve correctly", () => {
  // Tokyo is UTC+9 year-round, so local midnight is the previous day at 15:00Z.
  const start = zonedDayStart("2026-08-07", "Asia/Tokyo");
  assert.equal(start.toISOString(), "2026-08-06T15:00:00.000Z");
});

test("todayInZone returns an ISO date", () => {
  assert.match(todayInZone("Asia/Tokyo"), /^\d{4}-\d{2}-\d{2}$/);
});

test("todayInZone respects the zone at a known instant", () => {
  // 23:30Z on the 7th is already the 8th in Tokyo, still the 7th in New York.
  const instant = new Date("2026-08-07T23:30:00.000Z");
  assert.equal(todayInZone("Asia/Tokyo", instant), "2026-08-08");
  assert.equal(todayInZone("America/New_York", instant), "2026-08-07");
});

test("addDays crosses month and year boundaries", () => {
  assert.equal(addDays("2026-08-07", 1), "2026-08-08");
  assert.equal(addDays("2026-08-31", 1), "2026-09-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-01-01", -1), "2025-12-31");
});

test("durations format readably", () => {
  assert.equal(formatDuration(45), "45m");
  assert.equal(formatDuration(60), "1h");
  assert.equal(formatDuration(150), "2h 30m");
});
