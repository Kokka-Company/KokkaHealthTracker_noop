import { prisma } from "./db";
import { getAccount } from "./tokens";
import {
  fetchCurrentCycle,
  fetchLatestRecovery,
  fetchLatestSleep,
} from "./whoop/client";
import { fetchCalendarDay } from "./calendar/microsoft";
import { computeOutlook, type MetricInputs } from "./scoring";
import type { CalendarDay } from "./calendar/types";
import { todayInZone, zonedDayStart, zonedDayEnd } from "./date";

export type SyncResult = {
  date: string;
  whoop: "ok" | "skipped" | "error";
  calendar: "ok" | "skipped" | "error";
  errors: string[];
};

const MS_PER_MINUTE = 60_000;

/**
 * Pulls today's data from every connected provider and writes one
 * DailySnapshot row. Each provider is independent — one failing never blocks
 * the other, it just lands in `errors` for the UI to surface.
 */
export async function syncDay(
  userId: string,
  date?: string,
): Promise<SyncResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const timezone = user.timezone || "UTC";
  const targetDate = date ?? todayInZone(timezone);

  const dayStart = zonedDayStart(targetDate, timezone);
  const dayEnd = zonedDayEnd(targetDate, timezone);

  const result: SyncResult = {
    date: targetDate,
    whoop: "skipped",
    calendar: "skipped",
    errors: [],
  };

  const metrics: MetricInputs = {};
  const snapshot: Record<string, unknown> = {};

  // --- WHOOP ---------------------------------------------------------------
  if (await getAccount(userId, "whoop")) {
    try {
      // Recovery is scored against the night's sleep, which may have started
      // the previous evening — widen the window back 36 hours to catch it.
      const whoopStart = new Date(dayStart.getTime() - 36 * 60 * MS_PER_MINUTE);

      const [recovery, sleep, cycle] = await Promise.all([
        fetchLatestRecovery(userId, whoopStart, dayEnd),
        fetchLatestSleep(userId, whoopStart, dayEnd),
        fetchCurrentCycle(userId, whoopStart, dayEnd),
      ]);

      if (recovery?.score) {
        metrics.recoveryScore = Math.round(recovery.score.recovery_score);
        metrics.restingHeartRate = Math.round(recovery.score.resting_heart_rate);
        metrics.hrvMilli = recovery.score.hrv_rmssd_milli;

        snapshot.recoveryScore = metrics.recoveryScore;
        snapshot.restingHeartRate = metrics.restingHeartRate;
        snapshot.hrvMilli = metrics.hrvMilli;
      }

      if (sleep?.score) {
        const stages = sleep.score.stage_summary;
        const asleepMilli =
          stages.total_in_bed_time_milli - stages.total_awake_time_milli;

        const need = sleep.score.sleep_needed;
        const needMilli =
          need.baseline_milli +
          need.need_from_sleep_debt_milli +
          need.need_from_recent_strain_milli -
          need.need_from_recent_nap_milli;

        metrics.sleepDurationMin = Math.round(asleepMilli / MS_PER_MINUTE);
        metrics.sleepNeedMin = Math.round(needMilli / MS_PER_MINUTE);
        metrics.sleepPerformance =
          typeof sleep.score.sleep_performance_percentage === "number"
            ? Math.round(sleep.score.sleep_performance_percentage)
            : null;
        metrics.respiratoryRate = sleep.score.respiratory_rate ?? null;

        snapshot.sleepDurationMin = metrics.sleepDurationMin;
        snapshot.sleepNeedMin = metrics.sleepNeedMin;
        snapshot.sleepPerformance = metrics.sleepPerformance;
        snapshot.respiratoryRate = metrics.respiratoryRate;
      }

      if (cycle?.score) {
        metrics.dayStrain = cycle.score.strain;
        snapshot.dayStrain = cycle.score.strain;
        snapshot.averageHeartRate = Math.round(cycle.score.average_heart_rate);
        snapshot.caloriesKj = cycle.score.kilojoule;
      }

      result.whoop = "ok";
    } catch (error) {
      result.whoop = "error";
      result.errors.push(
        error instanceof Error ? error.message : "WHOOP sync failed.",
      );
    }
  }

  // --- Calendar ------------------------------------------------------------
  let calendarDay: CalendarDay | null = null;

  if (await getAccount(userId, "microsoft")) {
    try {
      calendarDay = await fetchCalendarDay(userId, dayStart, dayEnd, timezone);

      snapshot.calendarEventsJson = JSON.stringify(calendarDay);
      snapshot.meetingCount = calendarDay.meetingCount;
      snapshot.meetingMinutes = calendarDay.meetingMinutes;
      snapshot.firstEventAt = calendarDay.firstEventAt
        ? new Date(calendarDay.firstEventAt)
        : null;
      snapshot.lastEventAt = calendarDay.lastEventAt
        ? new Date(calendarDay.lastEventAt)
        : null;

      result.calendar = "ok";
    } catch (error) {
      result.calendar = "error";
      result.errors.push(
        error instanceof Error ? error.message : "Calendar sync failed.",
      );
    }
  }

  // --- Derived + persist ---------------------------------------------------
  const outlook = computeOutlook(metrics, calendarDay);
  snapshot.outlookScore = outlook.score;
  snapshot.outlookLabel = outlook.label;
  snapshot.syncedAt = new Date();

  // Nothing came back from either provider — don't overwrite a good snapshot
  // with an empty one.
  if (result.whoop !== "ok" && result.calendar !== "ok") {
    return result;
  }

  await prisma.dailySnapshot.upsert({
    where: { userId_date: { userId, date: targetDate } },
    create: { userId, date: targetDate, ...snapshot },
    update: snapshot,
  });

  return result;
}
