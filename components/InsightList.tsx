import { cn } from "@/lib/cn";
import type { OutlookInsight } from "@/lib/scoring";

/*
 * Semantic colour carries on the rule and the dot, never on the copy — body
 * text stays gray-700 (10.31 on white) so an insight is legible regardless of
 * its severity. Neutral falls back to brand-mid, the interactive colour.
 */
const KIND_STYLES: Record<
  InsightKind,
  { dot: string; border: string; tint: string }
> = {
  positive: {
    dot: "bg-success",
    border: "border-l-success",
    tint: "bg-success-bg/40",
  },
  caution: {
    dot: "bg-caution",
    border: "border-l-caution",
    tint: "bg-caution/5",
  },
  warning: { dot: "bg-error", border: "border-l-error", tint: "bg-error/5" },
  neutral: {
    dot: "bg-brand-mid",
    border: "border-l-brand-mid",
    tint: "bg-brand-mid/5",
  },
};

type InsightKind = OutlookInsight["kind"];

export function InsightList({ insights }: { insights: OutlookInsight[] }) {
  if (insights.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-gray-300 bg-white px-4 py-6 text-center text-sm text-gray-500">
        Nothing to flag yet. Sync once both providers are connected.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {insights.map((insight, index) => {
        const style = KIND_STYLES[insight.kind];
        return (
          <li
            key={`${insight.title}-${index}`}
            className={cn(
              "rounded-r-lg border border-l-2 border-gray-200 py-3 pl-4 pr-4",
              style.border,
              style.tint,
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                  style.dot,
                )}
                aria-hidden
              />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-brand-darker">
                  {insight.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-gray-700">
                  {insight.detail}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
