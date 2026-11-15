import { cn } from "@/lib/cn";

export type MetricTone = "good" | "warn" | "bad" | "neutral";

/*
 * Tone applies to the numeral only. At 24px semibold these clear AA for large
 * text on white (success 3.4, error 3.8, caution 3.1); none of them are safe
 * for the small print, which stays gray-500.
 */
const TONE_CLASSES: Record<MetricTone, string> = {
  good: "text-success",
  warn: "text-caution",
  bad: "text-error",
  neutral: "text-brand-darker",
};

export function MetricCard({
  label,
  value,
  unit,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string | number | null | undefined;
  unit?: string;
  detail?: string;
  tone?: MetricTone;
}) {
  const empty = value === null || value === undefined || value === "";

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-brand-mid/40">
      <p className="eyebrow">{label}</p>
      <p className="mt-2.5 flex items-baseline gap-1">
        <span
          className={cn(
            "text-2xl font-semibold tabular-nums",
            empty ? "text-gray-400" : TONE_CLASSES[tone],
          )}
        >
          {empty ? "—" : value}
        </span>
        {!empty && unit && (
          <span className="text-sm font-normal text-gray-500">{unit}</span>
        )}
      </p>
      {detail && (
        <p className="mt-1.5 text-xs leading-snug text-gray-500">{detail}</p>
      )}
    </div>
  );
}
