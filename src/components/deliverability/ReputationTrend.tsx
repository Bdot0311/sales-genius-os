import type { ReputationSnapshot } from "@/lib/deliverability-db";

interface Props {
  snapshots: ReputationSnapshot[];
  className?: string;
}

/**
 * Compact inline-SVG sparkline of a sending account's reputation over time.
 * Renders nothing meaningful until at least two scored days exist (honest —
 * a trend needs more than one point).
 */
export const ReputationTrend = ({ snapshots, className }: Props) => {
  const scored = snapshots
    .filter((s) => s.reputation_score !== null)
    .map((s) => ({ date: s.snapshot_date, value: s.reputation_score as number }));

  // Until a score exists, show the daily send-volume trend instead of an empty
  // placeholder — it's real data from the same snapshots.
  const isVolume = scored.length < 2;
  const points = isVolume
    ? snapshots.map((s) => ({ date: s.snapshot_date, value: s.volume ?? 0 }))
    : scored;

  if (points.length < 2) {
    return (
      <div className={`text-xs text-muted-foreground ${className ?? ""}`}>
        Trend appears after a few days of sending.
      </div>
    );
  }


  const w = 160;
  const h = 40;
  const pad = 3;
  const values = points.map((p) => p.value);
  const min = 0;
  const max = isVolume ? Math.max(...values, 1) : Math.max(...values, 100);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = pad + (i / (points.length - 1)) * (w - pad * 2);
    const y = h - pad - ((p.value - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = values[values.length - 1];
  const first = values[0];
  const stroke = isVolume
    ? "hsl(var(--primary))"
    : last >= 70 ? "hsl(160 60% 45%)" : last >= 50 ? "hsl(45 93% 47%)" : "hsl(0 72% 51%)";
  const delta = last - first;

  return (
    <div className={`flex items-center gap-2 ${className ?? ""}`}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden="true">
        <polyline points={coords.join(" ")} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-xs tabular-nums text-muted-foreground">
        {isVolume ? `volume · ${points.length}d` : `${delta >= 0 ? "+" : ""}${delta} / ${points.length}d`}
      </span>
    </div>
  );

    </div>
  );
};
