import type { CalendarDay } from "./calendar/types";
import { formatDuration } from "./date";

/**
 * The daily outlook model.
 *
 * Two independent quantities, then a comparison between them:
 *
 *   capacity — what the body has to give today, from WHOOP recovery + sleep.
 *   demand   — what the calendar is going to take, from meeting load + shape.
 *
 * The outlook is capacity adjusted for demand: a 70% recovery on an empty day
 * is a good day, the same 70% behind seven hours of back-to-back calls is not.
 * Either input can be missing — the score degrades to whichever half exists.
 */

export type MetricInputs = {
  recoveryScore?: number | null;
  restingHeartRate?: number | null;
  hrvMilli?: number | null;
  sleepPerformance?: number | null;
  sleepDurationMin?: number | null;
  sleepNeedMin?: number | null;
  respiratoryRate?: number | null;
  dayStrain?: number | null;
};

export type OutlookInsight = {
  kind: "positive" | "caution" | "warning" | "neutral";
  title: string;
  detail: string;
};

export type Outlook = {
  score: number | null;
  label: string;
  summary: string;
  capacity: number | null;
  demand: number | null;
  insights: OutlookInsight[];
  hasBody: boolean;
  hasCalendar: boolean;
};

const clamp = (value: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, value));

/** Typical full workday of meetings, used to normalise demand. */
const HEAVY_MEETING_MINUTES = 360;

/**
 * Capacity, 0–100. Recovery dominates because it is WHOOP's own composite of
 * HRV, RHR and sleep; sleep performance and raw sleep debt refine it.
 */
export function computeCapacity(metrics: MetricInputs): number | null {
  const parts: { value: number; weight: number }[] = [];

  if (typeof metrics.recoveryScore === "number") {
    parts.push({ value: clamp(metrics.recoveryScore), weight: 0.6 });
  }

  if (typeof metrics.sleepPerformance === "number") {
    parts.push({ value: clamp(metrics.sleepPerformance), weight: 0.25 });
  }

  // Sleep debt: actual sleep as a fraction of WHOOP's calculated need.
  if (
    typeof metrics.sleepDurationMin === "number" &&
    typeof metrics.sleepNeedMin === "number" &&
    metrics.sleepNeedMin > 0
  ) {
    const ratio = metrics.sleepDurationMin / metrics.sleepNeedMin;
    parts.push({ value: clamp(ratio * 100), weight: 0.15 });
  }

  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, p) => sum + p.weight, 0);
  const weighted = parts.reduce((sum, p) => sum + p.value * p.weight, 0);

  return Math.round(weighted / totalWeight);
}

/**
 * Demand, 0–100. Volume is the base; the shape of the day adds to it, because
 * six hours in one block costs less than six hours shattered into fragments.
 */
export function computeDemand(day: CalendarDay | null): number | null {
  if (!day) return null;

  const volume = clamp((day.meetingMinutes / HEAVY_MEETING_MINUTES) * 70, 0, 70);

  // Each back-to-back transition adds load, capped so a busy day cannot
  // run away with the score.
  const backToBack = clamp(day.backToBackCount * 4, 0, 16);

  // A day with no meaningful focus block is more taxing than one with a gap.
  const fragmentation =
    day.meetingCount >= 2 && day.longestFocusBlockMinutes < 60 ? 8 : 0;

  // A day that stretches from an early start to a late finish compresses the
  // time available to recover, independent of how much of it is booked.
  let edges = 0;
  if (day.firstEventAt && day.lastEventAt) {
    const spanHours =
      (Date.parse(day.lastEventAt) - Date.parse(day.firstEventAt)) / 3_600_000;
    if (spanHours > 9) edges = 6;
    else if (spanHours > 7) edges = 3;
  }

  return Math.round(clamp(volume + backToBack + fragmentation + edges));
}

function labelFor(score: number): { label: string; summary: string } {
  if (score >= 80) {
    return {
      label: "Prime",
      summary: "Your body is ready and the day is clear. Good day to push.",
    };
  }
  if (score >= 65) {
    return {
      label: "Strong",
      summary: "Solid capacity for the load ahead. Train or tackle hard work.",
    };
  }
  if (score >= 50) {
    return {
      label: "Moderate",
      summary: "Enough in the tank, but not a day to overreach.",
    };
  }
  if (score >= 35) {
    return {
      label: "Strained",
      summary: "Demand is outrunning recovery. Protect what matters most.",
    };
  }
  return {
    label: "Depleted",
    summary: "Low reserves against a heavy day. Cut scope and get to bed early.",
  };
}

function buildInsights(
  metrics: MetricInputs,
  day: CalendarDay | null,
  capacity: number | null,
  demand: number | null,
): OutlookInsight[] {
  const insights: OutlookInsight[] = [];

  // --- Body ----------------------------------------------------------------
  const recovery = metrics.recoveryScore;
  if (typeof recovery === "number") {
    if (recovery >= 67) {
      insights.push({
        kind: "positive",
        title: `Recovery is in the green at ${recovery}%`,
        detail:
          "Your body is adapted and ready for strain. A good day for your hardest session or deepest work.",
      });
    } else if (recovery >= 34) {
      insights.push({
        kind: "caution",
        title: `Recovery is in the yellow at ${recovery}%`,
        detail:
          "Maintain rather than build. Moderate effort today keeps you from digging a hole.",
      });
    } else {
      insights.push({
        kind: "warning",
        title: `Recovery is in the red at ${recovery}%`,
        detail:
          "Your body is asking for rest. Prioritise sleep, hydration and light movement over intensity.",
      });
    }
  }

  if (
    typeof metrics.sleepDurationMin === "number" &&
    typeof metrics.sleepNeedMin === "number" &&
    metrics.sleepNeedMin > 0
  ) {
    const deficit = metrics.sleepNeedMin - metrics.sleepDurationMin;
    if (deficit > 45) {
      insights.push({
        kind: "warning",
        title: `You're ${formatDuration(deficit)} short on sleep`,
        detail: `You slept ${formatDuration(
          metrics.sleepDurationMin,
        )} against a need of ${formatDuration(
          metrics.sleepNeedMin,
        )}. Going to bed early tonight pays back more than anything else you can do today.`,
      });
    } else if (deficit <= 0) {
      insights.push({
        kind: "positive",
        title: "Sleep need fully met",
        detail: `You slept ${formatDuration(
          metrics.sleepDurationMin,
        )}, covering your calculated need. That is the foundation of today's capacity.`,
      });
    }
  }

  if (typeof metrics.dayStrain === "number" && metrics.dayStrain >= 14) {
    insights.push({
      kind: "caution",
      title: `Strain is already at ${metrics.dayStrain.toFixed(1)}`,
      detail:
        "You have accumulated significant cardiovascular load today. Additional intensity will cost you tomorrow's recovery.",
    });
  }

  // --- Calendar ------------------------------------------------------------
  if (day) {
    if (day.meetingCount === 0) {
      insights.push({
        kind: "positive",
        title: "No meetings on the calendar",
        detail:
          "The whole day is yours. This is the rarest resource you have — spend it on the work that actually moves things.",
      });
    } else {
      if (day.meetingMinutes >= HEAVY_MEETING_MINUTES) {
        insights.push({
          kind: "warning",
          title: `${formatDuration(day.meetingMinutes)} of meetings booked`,
          detail: `${day.meetingCount} events fill most of the working day. If anything can move, move it — this leaves almost no room for recovery or deep work.`,
        });
      } else if (day.meetingMinutes >= 180) {
        insights.push({
          kind: "caution",
          title: `${formatDuration(day.meetingMinutes)} of meetings booked`,
          detail: `${day.meetingCount} events across the day. Guard the gaps between them.`,
        });
      }

      if (day.backToBackCount >= 3) {
        insights.push({
          kind: "warning",
          title: `${day.backToBackCount} back-to-back transitions`,
          detail:
            "Consecutive meetings with no gap drive sympathetic load all day. Shorten a few to 25 or 50 minutes to build in breathing room.",
        });
      }

      if (day.longestFocusBlockMinutes >= 120) {
        insights.push({
          kind: "positive",
          title: `${formatDuration(
            day.longestFocusBlockMinutes,
          )} of uninterrupted time`,
          detail:
            "Your longest open block is big enough for real deep work. Put your most demanding task there.",
        });
      } else if (day.meetingCount >= 3 && day.longestFocusBlockMinutes < 60) {
        insights.push({
          kind: "caution",
          title: "No meaningful focus block",
          detail:
            "Every gap today is under an hour. Consider consolidating meetings to open one protected stretch.",
        });
      }
    }
  }

  // --- The comparison ------------------------------------------------------
  if (capacity !== null && demand !== null) {
    if (demand >= 55 && capacity < 50) {
      insights.push({
        kind: "warning",
        title: "Heavy day, low reserves",
        detail:
          "Today's demand is high while your body is under-recovered. This is the combination that turns into burnout if it repeats. Cut what you can.",
      });
    } else if (demand <= 25 && capacity >= 70) {
      insights.push({
        kind: "positive",
        title: "Capacity exceeds demand",
        detail:
          "You are well recovered with a light calendar. This is the ideal window for a hard training session or an ambitious piece of work.",
      });
    }
  }

  return insights;
}

export function computeOutlook(
  metrics: MetricInputs,
  day: CalendarDay | null,
): Outlook {
  const capacity = computeCapacity(metrics);
  const demand = computeDemand(day);

  const hasBody = capacity !== null;
  const hasCalendar = demand !== null;

  let score: number | null = null;

  if (capacity !== null && demand !== null) {
    // Demand below the threshold is absorbed without cost; above it, each
    // point of demand erodes the outlook.
    const excess = Math.max(0, demand - 30);
    score = Math.round(clamp(capacity - excess * 0.45));
  } else if (capacity !== null) {
    score = capacity;
  } else if (demand !== null) {
    // Calendar only: report the inverse of demand as a rough day-shape score.
    score = Math.round(clamp(100 - demand));
  }

  const insights = buildInsights(metrics, day, capacity, demand);

  if (score === null) {
    return {
      score: null,
      label: "No data",
      summary:
        "Connect WHOOP and your calendar, then run a sync to see today's outlook.",
      capacity,
      demand,
      insights,
      hasBody,
      hasCalendar,
    };
  }

  const { label, summary } = labelFor(score);

  return {
    score,
    label,
    summary:
      hasBody && hasCalendar
        ? summary
        : hasBody
          ? `${summary} (Calendar not connected — demand is not factored in.)`
          : `${summary} (WHOOP not connected — based on calendar load only.)`,
    capacity,
    demand,
    insights,
    hasBody,
    hasCalendar,
  };
}
