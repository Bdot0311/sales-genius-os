import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Lead Score v2 tier badge (Phase 1). Shows the A/B/C tier on a queue row and
// opens the deterministic scoring breakdown. Reads the fields written by the
// score-lead-v2 function; renders a neutral placeholder when a lead is unscored.

interface ScoreBreakdown {
  fit?: { score?: number; matched?: Record<string, boolean>; applicable?: string[] };
  intent?: {
    score?: number;
    count?: number;
    repeat_account?: boolean;
    most_recent_days?: number | null;
    top_signal?: string | null;
  };
}

interface Lead {
  tier?: string | null;
  fit_score?: number | null;
  intent_score?: number | null;
  score_reason?: string | null;
  score_breakdown?: ScoreBreakdown | null;
}

const TIER_CONFIG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  A: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "tier a" },
  B: { color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30", label: "tier b" },
  C: { color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/25", label: "tier c" },
};

function recency(days?: number | null): string {
  if (days == null) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export const LeadTierBadge = ({ lead }: { lead: Lead }) => {
  const tier = lead.tier ?? null;
  if (!tier || !TIER_CONFIG[tier]) {
    return <span className="text-xs text-muted-foreground">not scored</span>;
  }
  const cfg = TIER_CONFIG[tier];
  const bd = lead.score_breakdown ?? {};
  const fitMatched = Object.entries(bd.fit?.matched ?? {}).filter(([, v]) => v).map(([k]) => k);
  const intent = bd.intent ?? {};

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border cursor-pointer hover:opacity-80 transition-opacity ${cfg.color} ${cfg.bg} ${cfg.border}`}
        >
          {tier}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-sm">{cfg.label}</span>
            <span className={`text-2xl font-bold ${cfg.color}`}>{tier}</span>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>fit <span className="text-foreground font-medium">{lead.fit_score ?? 0}</span></span>
            <span>intent <span className="text-foreground font-medium">{lead.intent_score ?? 0}</span></span>
          </div>
        </div>

        {lead.score_reason && (
          <div className="p-4 border-b border-border">
            <p className="text-xs text-foreground/80">{lead.score_reason}</p>
          </div>
        )}

        <div className="p-4 space-y-2 text-xs">
          <div>
            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">fit</span>
            <p className="text-foreground/80 mt-0.5">
              {fitMatched.length ? `matches on ${fitMatched.join(", ")}` : "no icp criteria matched"}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground uppercase tracking-wider text-[10px]">intent</span>
            <p className="text-foreground/80 mt-0.5">
              {intent.score
                ? `${intent.top_signal ? intent.top_signal.replace(/_/g, " ") : "signal"} ${recency(intent.most_recent_days)}${intent.repeat_account ? ", repeat activity" : ""}`
                : "no recent signals"}
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
