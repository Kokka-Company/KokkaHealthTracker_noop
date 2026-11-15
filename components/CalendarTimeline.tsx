import { cn } from "@/lib/cn";
import { formatTime, formatDuration } from "@/lib/date";
import type { CalendarDay } from "@/lib/calendar/types";

function durationMinutes(start: string, end: string): number {
  return Math.max(0, (Date.parse(end) - Date.parse(start)) / 60_000);
}

export function CalendarTimeline({
  day,
  timezone,
}: {
  day: CalendarDay | null;
  timezone: string;
}) {
  if (!day) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
        Connect your Microsoft 365 calendar to see today&apos;s schedule here.
      </p>
    );
  }

  if (day.events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-6 text-center">
        <p className="text-sm font-semibold text-brand-darker">
          Nothing on the calendar
        </p>
        <p className="mt-1 text-sm text-gray-500">
          A completely open day. Decide now how you want to spend it.
        </p>
      </div>
    );
  }

  // Render in chronological order, inserting the gaps between meetings so the
  // shape of the day is visible at a glance.
  const rows: React.ReactNode[] = [];
  let previousEnd: number | null = null;

  day.events.forEach((event, index) => {
    const start = Date.parse(event.start);

    if (previousEnd !== null && !event.isAllDay) {
      const gap = (start - previousEnd) / 60_000;
      if (gap >= 25) {
        rows.push(
          <li
            key={`gap-${index}`}
            className="flex items-center gap-3 py-1.5 pl-[76px] text-xs text-gray-500"
          >
            <span className="h-px flex-1 bg-gray-200" />
            <span className="shrink-0">{formatDuration(gap)} free</span>
            <span className="h-px flex-1 bg-gray-200" />
          </li>,
        );
      }
    }

    const minutes = durationMinutes(event.start, event.end);
    const isBusy = event.showAs === "busy" || event.showAs === "oof";

    rows.push(
      <li key={event.id} className="flex gap-3">
        <div className="w-[68px] shrink-0 pt-1 text-right">
          <p className="text-xs font-semibold tabular-nums text-gray-700">
            {event.isAllDay ? "All day" : formatTime(event.start, timezone)}
          </p>
          {!event.isAllDay && (
            <p className="text-[11px] tabular-nums text-gray-400">
              {formatDuration(minutes)}
            </p>
          )}
        </div>

        {/* brand-mid clears 3.60 as a UI border, which is all it is used for. */}
        <div
          className={cn(
            "min-w-0 flex-1 rounded-lg border border-l-2 border-gray-200 bg-white px-3 py-2.5",
            isBusy ? "border-l-brand-mid" : "border-l-gray-300",
          )}
        >
          <p className="truncate text-sm font-medium text-brand-darker">
            {event.title}
          </p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-gray-500">
            {event.attendeeCount > 0 && (
              <span>
                {event.attendeeCount}{" "}
                {event.attendeeCount === 1 ? "attendee" : "attendees"}
              </span>
            )}
            {event.isOnline && <span>Online</span>}
            {event.location && <span className="truncate">{event.location}</span>}
            {event.showAs === "free" && <span>Free</span>}
          </div>
        </div>
      </li>,
    );

    if (!event.isAllDay) {
      previousEnd = Math.max(previousEnd ?? 0, Date.parse(event.end));
    }
  });

  return <ul className="space-y-2">{rows}</ul>;
}
