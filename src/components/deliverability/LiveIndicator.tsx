import { useEffect, useState } from "react";
import type { LiveStatus } from "@/hooks/use-deliverability-realtime";

function relative(from: Date): string {
  const s = Math.max(0, Math.round((Date.now() - from.getTime()) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

/** Small "Live" pill with a pulsing dot and a relative last-updated stamp. */
export const LiveIndicator = ({ status, lastUpdate }: { status: LiveStatus; lastUpdate: Date }) => {
  const [, force] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => force((n) => n + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const tone =
    status === "live" ? "bg-green-500" : status === "connecting" ? "bg-yellow-500" : "bg-muted-foreground";
  const label = status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Reconnecting";

  return (
    <div className="flex items-center gap-2 rounded-full border border-border/50 bg-card/60 px-2.5 py-1 text-xs text-muted-foreground">
      <span className="relative flex h-2 w-2 shrink-0">
        {status === "live" && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone} opacity-70`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${tone}`} />
      </span>
      <span className="font-medium text-foreground">{label}</span>
      <span aria-hidden>·</span>
      <span className="tabular-nums">updated {relative(lastUpdate)}</span>
    </div>
  );
};
