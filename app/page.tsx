import Image from "next/image";

import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { whoopConfigured, microsoftConfigured } from "@/lib/env";
import { computeOutlook, type MetricInputs } from "@/lib/scoring";
import { todayInZone, formatDayLabel, formatDuration } from "@/lib/date";
import type { CalendarDay } from "@/lib/calendar/types";

import { OutlookHeader } from "@/components/OutlookHeader";
import { MetricCard, type MetricTone } from "@/components/MetricCard";
import { InsightList } from "@/components/InsightList";
import { CalendarTimeline } from "@/components/CalendarTimeline";
import { ConnectionBar } from "@/components/ConnectionBar";

// Always render fresh — the dashboard reflects mutable per-request state.
export const dynamic = "force-dynamic";

function recoveryTone(score: number | null): MetricTone {
  if (score === null) return "neutral";
  if (score >= 67) return "good";
  if (score >= 34) return "warn";
  return "bad";
}

function Banner({ message, ok }: { message: string; ok: boolean }) {
  return (
    <div
      role="status"
      className={
        ok
          ? "rounded-xl border border-success/30 bg-success-bg px-4 py-3 text-sm text-gray-700"
          : "rounded-xl border border-error/40 bg-error/5 px-4 py-3 text-sm text-gray-700"
      }
    >
      {message}
    </div>
  );
}

/** Section heading in the light sections: eyebrow over a Playfair title. */
function SectionHeading({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-4">
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-1.5 text-xl text-brand-darker font-display">{title}</h2>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const errorMessage =
    typeof params.error === "string" ? params.error : undefined;
  const successMessage =
    typeof params.connected === "string" ? params.connected : undefined;

  const user = await getCurrentUser();
  const timezone = user?.timezone || "UTC";
  const today = todayInZone(timezone);

  const snapshot = user
    ? await prisma.dailySnapshot.findUnique({
        where: { userId_date: { userId: user.id, date: today } },
      })
    : null;

  const connectedProviders = new Set(user?.accounts.map((a) => a.provider) ?? []);

  const metrics: MetricInputs = {
    recoveryScore: snapshot?.recoveryScore ?? null,
    restingHeartRate: snapshot?.restingHeartRate ?? null,
    hrvMilli: snapshot?.hrvMilli ?? null,
    sleepPerformance: snapshot?.sleepPerformance ?? null,
    sleepDurationMin: snapshot?.sleepDurationMin ?? null,
    sleepNeedMin: snapshot?.sleepNeedMin ?? null,
    respiratoryRate: snapshot?.respiratoryRate ?? null,
    dayStrain: snapshot?.dayStrain ?? null,
  };

  let calendarDay: CalendarDay | null = null;
  if (snapshot?.calendarEventsJson) {
    try {
      calendarDay = JSON.parse(snapshot.calendarEventsJson) as CalendarDay;
    } catch {
      calendarDay = null;
    }
  }

  const outlook = computeOutlook(metrics, calendarDay);
  const sleepDeficit =
    metrics.sleepDurationMin != null && metrics.sleepNeedMin != null
      ? metrics.sleepNeedMin - metrics.sleepDurationMin
      : null;

  return (
    <div className="flex min-h-screen flex-col">
      {/*
       * Dark section. The brand alternates full-bleed brand-darker against
       * light down the page — that rhythm is the layout system, and it is why
       * this tool has no theme toggle.
       */}
      <header className="bg-brand-darker">
        <div className="mx-auto w-full max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-5">
            <Image
              src="/brand/lockup-horizontal-white.svg"
              alt="Kokka &amp; Company"
              width={200}
              height={31}
              priority
              className="h-[26px] w-auto sm:h-[30px]"
            />
            <div className="text-right">
              {user?.displayName && (
                <p className="text-sm font-medium text-white">
                  {user.displayName}
                </p>
              )}
              <p className="text-xs text-white/60">{timezone}</p>
            </div>
          </div>

          <div className="border-t border-white/10 py-10 sm:py-14">
            <OutlookHeader
              outlook={outlook}
              dayLabel={formatDayLabel(today, timezone)}
            />
          </div>
        </div>
      </header>

      {/* Light section. */}
      <main className="flex-1 bg-gray-50">
        <div className="mx-auto w-full max-w-7xl space-y-10 px-4 py-10 sm:px-6 sm:py-14">
          {(errorMessage || successMessage) && (
            <div className="space-y-3">
              {errorMessage && <Banner message={errorMessage} ok={false} />}
              {successMessage && <Banner message={successMessage} ok />}
            </div>
          )}

          <section>
            <SectionHeading eyebrow="Today" title="Body" />
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label="Recovery"
                value={metrics.recoveryScore}
                unit="%"
                tone={recoveryTone(metrics.recoveryScore ?? null)}
                detail="WHOOP's composite of HRV, RHR and sleep."
              />
              <MetricCard
                label="Sleep"
                value={
                  metrics.sleepDurationMin != null
                    ? formatDuration(metrics.sleepDurationMin)
                    : null
                }
                tone={
                  sleepDeficit == null
                    ? "neutral"
                    : sleepDeficit > 45
                      ? "bad"
                      : sleepDeficit > 0
                        ? "warn"
                        : "good"
                }
                detail={
                  metrics.sleepNeedMin != null
                    ? `Need ${formatDuration(metrics.sleepNeedMin)}`
                    : undefined
                }
              />
              <MetricCard
                label="HRV"
                value={
                  metrics.hrvMilli != null ? Math.round(metrics.hrvMilli) : null
                }
                unit="ms"
                detail="Heart rate variability overnight."
              />
              <MetricCard
                label="Resting HR"
                value={metrics.restingHeartRate}
                unit="bpm"
                detail="Lower generally means better recovered."
              />
              <MetricCard
                label="Day strain"
                value={
                  metrics.dayStrain != null ? metrics.dayStrain.toFixed(1) : null
                }
                detail="Cardiovascular load so far, 0–21."
              />
              <MetricCard
                label="Sleep performance"
                value={metrics.sleepPerformance}
                unit="%"
                detail="Sleep achieved against sleep needed."
              />
              <MetricCard
                label="Respiratory rate"
                value={
                  metrics.respiratoryRate != null
                    ? metrics.respiratoryRate.toFixed(1)
                    : null
                }
                unit="rpm"
                detail="A rise can precede illness."
              />
              <MetricCard
                label="Meetings"
                value={calendarDay ? calendarDay.meetingCount : null}
                detail={
                  calendarDay
                    ? `${formatDuration(calendarDay.meetingMinutes)} booked`
                    : undefined
                }
              />
            </div>
          </section>

          <div className="grid gap-10 lg:grid-cols-5 lg:gap-8">
            <section className="lg:col-span-3">
              <SectionHeading eyebrow="Read-out" title="What this means today" />
              <InsightList insights={outlook.insights} />
            </section>

            <section className="lg:col-span-2">
              <SectionHeading eyebrow="Calendar" title="Today's schedule" />
              <CalendarTimeline day={calendarDay} timezone={timezone} />
            </section>
          </div>

          <section className="border-t border-gray-200 pt-8">
            <SectionHeading eyebrow="Sources" title="Connections" />
            <ConnectionBar
              timezone={timezone}
              lastSyncedAt={snapshot?.syncedAt ?? null}
              connections={[
                {
                  provider: "whoop",
                  name: "WHOOP",
                  connected: connectedProviders.has("whoop"),
                  configured: whoopConfigured(),
                },
                {
                  provider: "microsoft",
                  name: "Microsoft 365 Calendar",
                  connected: connectedProviders.has("microsoft"),
                  configured: microsoftConfigured(),
                },
              ]}
            />
          </section>
        </div>
      </main>

      {/* Closing dark section, completing the alternation. */}
      <footer className="bg-brand-darker">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-8 sm:px-6">
          <div className="flex items-center gap-3">
            <Image
              src="/brand/k-mark-white.svg"
              alt=""
              width={24}
              height={24}
              className="h-6 w-auto opacity-80"
            />
            <p className="text-xs text-white/60">
              Kokka &amp; Company — self-hosted. Your data stays on your machine.
            </p>
          </div>
          <p className="text-xs text-white/40">
            Capacity and demand are computed locally from WHOOP and Microsoft
            Graph.
          </p>
        </div>
      </footer>
    </div>
  );
}
