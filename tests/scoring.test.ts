import { test } from "node:test";
import assert from "node:assert/strict";
import { computeOutlook, computeCapacity, computeDemand } from "../lib/scoring";
import { summarizeDay } from "../lib/calendar/summarize";
import type { CalendarEvent } from "../lib/calendar/types";

function ev(id: string, startHour: number, endHour: number): CalendarEvent {
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
  };
}

const RECOVERED = {
  recoveryScore: 88,
  sleepPerformance: 95,
  sleepDurationMin: 490,
  sleepNeedMin: 480,
};

const DEPLETED = {
  recoveryScore: 22,
  sleepPerformance: 48,
  sleepDurationMin: 280,
  sleepNeedMin: 500,
  dayStrain: 16,
};

const PACKED = summarizeDay([
  ev("a", 8, 9),
  ev("b", 9, 10),
  ev("c", 10, 11),
  ev("d", 11, 13),
  ev("e", 13, 15),
  ev("f", 15, 18),
]);

test("capacity is null without any body data", () => {
  assert.equal(computeCapacity({}), null);
});

test("capacity falls back to recovery alone", () => {
  assert.equal(computeCapacity({ recoveryScore: 70 }), 70);
});

test("capacity separates recovered from depleted", () => {
  const high = computeCapacity(RECOVERED)!;
  const low = computeCapacity(DEPLETED)!;
  assert.ok(high >= 85, `expected high capacity, got ${high}`);
  assert.ok(low <= 40, `expected low capacity, got ${low}`);
});

test("demand is null without a calendar and zero on an empty day", () => {
  assert.equal(computeDemand(null), null);
  assert.equal(computeDemand(summarizeDay([])), 0);
});

test("demand stays within bounds on a packed day", () => {
  const demand = computeDemand(PACKED)!;
  assert.ok(demand >= 65, `expected heavy demand, got ${demand}`);
  assert.ok(demand <= 100);
});

test("no data at all yields no score", () => {
  const outlook = computeOutlook({}, null);
  assert.equal(outlook.score, null);
  assert.equal(outlook.label, "No data");
});

test("WHOOP without a calendar scores on capacity and says so", () => {
  const outlook = computeOutlook({ recoveryScore: 72 }, null);
  assert.equal(outlook.score, 72);
  assert.equal(outlook.hasCalendar, false);
  assert.match(outlook.summary, /Calendar not connected/);
});

test("calendar without WHOOP still scores and says so", () => {
  const outlook = computeOutlook({}, summarizeDay([ev("a", 9, 10)]));
  assert.equal(typeof outlook.score, "number");
  assert.equal(outlook.hasBody, false);
  assert.match(outlook.summary, /WHOOP not connected/);
});

test("recovered body on a light day reads as Prime", () => {
  const outlook = computeOutlook(RECOVERED, summarizeDay([ev("a", 10, 11)]));
  assert.equal(outlook.label, "Prime");
  assert.ok(outlook.insights.some((i) => i.kind === "positive"));
});

test("depleted body on a packed day reads as Depleted and warns", () => {
  const outlook = computeOutlook(DEPLETED, PACKED);
  assert.equal(outlook.label, "Depleted");

  const titles = outlook.insights.map((i) => i.title);
  assert.ok(titles.includes("Heavy day, low reserves"));
  assert.ok(titles.some((t) => t.includes("red")), "flags red recovery");
  assert.ok(titles.some((t) => t.includes("short on sleep")), "flags sleep debt");
});

test("the same body scores worse against a heavier calendar", () => {
  const body = {
    recoveryScore: 55,
    sleepPerformance: 70,
    sleepDurationMin: 420,
    sleepNeedMin: 460,
  };

  const light = computeOutlook(body, summarizeDay([]));
  const heavy = computeOutlook(
    body,
    summarizeDay([ev("a", 8, 10), ev("b", 10, 12), ev("c", 13, 15), ev("d", 15, 18)]),
  );

  assert.ok(
    heavy.score! < light.score!,
    `expected ${heavy.score} < ${light.score}`,
  );
});

test("scores never leave the 0-100 range", () => {
  const extremes = [
    computeOutlook(RECOVERED, summarizeDay([])),
    computeOutlook(DEPLETED, PACKED),
    computeOutlook({ recoveryScore: 0, sleepPerformance: 0 }, PACKED),
    computeOutlook({ recoveryScore: 100, sleepPerformance: 100 }, PACKED),
  ];

  for (const outlook of extremes) {
    assert.ok(outlook.score! >= 0 && outlook.score! <= 100, String(outlook.score));
  }
});
