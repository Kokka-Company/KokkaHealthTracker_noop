import { cn } from "@/lib/cn";
import type { Outlook } from "@/lib/scoring";

/*
 * This band is the brand's dark section — brand-darker ground, white headline,
 * brand-light for the figure that matters. brand-light on brand-darker is 7.86
 * (AA) and is the correct way to use that colour; it would be invisible on the
 * white sections below.
 *
 * The score dial keeps WHOOP's red/yellow/green language, since that is the
 * vocabulary the underlying data is reported in.
 */
function bandFor(score: number) {
  if (score >= 65) return { arc: "var(--color-success)", text: "text-success" };
  if (score >= 40) return { arc: "var(--color-caution)", text: "text-caution" };
  return { arc: "var(--color-error)", text: "text-error" };
}

function Dial({ score }: { score: number }) {
  const band = bandFor(score);
  // conic-gradient sweeps the arc; the inner disc masks it into a ring.
  const sweep = `${score * 3.6}deg`;

  return (
    <div
      className="relative h-36 w-36 shrink-0 rounded-full"
      style={{
        background: `conic-gradient(${band.arc} ${sweep}, rgb(255 255 255 / 0.2) ${sweep})`,
      }}
      role="img"
      aria-label={`Daily outlook score ${score} out of 100`}
    >
      <div className="absolute inset-[10px] flex flex-col items-center justify-center rounded-full bg-brand-darker">
        <span className={cn("text-4xl tabular-nums font-display", band.text)}>
          {score}
        </span>
        <span className="eyebrow eyebrow-on-dark mt-1">Outlook</span>
      </div>
    </div>
  );
}

function Bar({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: number | null;
  hint: string;
  tone: "capacity" | "demand";
}) {
  // Capacity is good when high; demand is good when low.
  const color =
    value === null
      ? "rgb(255 255 255 / 0.2)"
      : tone === "capacity"
        ? value >= 65
          ? "var(--color-success)"
          : value >= 40
            ? "var(--color-caution)"
            : "var(--color-error)"
        : value >= 60
          ? "var(--color-error)"
          : value >= 35
            ? "var(--color-caution)"
            : "var(--color-success)";

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-medium text-white/70">{label}</span>
        <span className="text-sm tabular-nums text-white">
          {value === null ? "—" : value}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${value ?? 0}%`, backgroundColor: color }}
        />
      </div>
      <p className="mt-1.5 text-xs leading-snug text-white/60">{hint}</p>
    </div>
  );
}

export function OutlookHeader({
  outlook,
  dayLabel,
}: {
  outlook: Outlook;
  dayLabel: string;
}) {
  return (
    <div className="flex flex-col items-start gap-8 sm:flex-row sm:items-center">
      {outlook.score !== null ? (
        <Dial score={outlook.score} />
      ) : (
        <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-full border border-dashed border-white/30 text-sm text-white/60">
          No data
        </div>
      )}

      <div className="min-w-0 flex-1">
        <p className="eyebrow eyebrow-on-dark">{dayLabel}</p>
        <h1 className="mt-2 text-4xl text-white font-display sm:text-5xl">
          {outlook.label}
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/70">
          {outlook.summary}
        </p>

        <div className="mt-7 grid gap-5 sm:grid-cols-2">
          <Bar
            label="Capacity"
            value={outlook.capacity}
            hint="What your body has to give, from recovery and sleep."
            tone="capacity"
          />
          <Bar
            label="Demand"
            value={outlook.demand}
            hint="What the calendar is going to take from you."
            tone="demand"
          />
        </div>
      </div>
    </div>
  );
}
