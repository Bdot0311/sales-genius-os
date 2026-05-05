import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Flame, ThermometerSnowflake, Zap } from "lucide-react";

interface Lead {
  intent_score?: number | null;
  intent_label?: string | null;
  intent_reasons?: string[] | null;
  recommended_angle?: string | null;
}

interface IntentScoreBadgeProps {
  lead: Lead;
}

type IntentLabel = 'Cold' | 'Warm' | 'Hot' | 'Very Hot';

const LABEL_CONFIG: Record<IntentLabel, { color: string; bg: string; border: string; icon: React.ComponentType<{ className?: string }> }> = {
  'Cold':     { color: 'text-slate-400',  bg: 'bg-slate-500/10',  border: 'border-slate-500/20',  icon: ThermometerSnowflake },
  'Warm':     { color: 'text-amber-400',  bg: 'bg-amber-500/10',  border: 'border-amber-500/20',  icon: Flame },
  'Hot':      { color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20', icon: Flame },
  'Very Hot': { color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: Zap },
};

export const IntentScoreBadge = ({ lead }: IntentScoreBadgeProps) => {
  const score = lead.intent_score;
  const label = (lead.intent_label ?? 'Cold') as IntentLabel;
  const reasons = lead.intent_reasons ?? [];
  const angle = lead.recommended_angle;

  if (score == null) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const cfg = LABEL_CONFIG[label] ?? LABEL_CONFIG['Cold'];
  const Icon = cfg.icon;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-pointer hover:opacity-80 transition-opacity ${cfg.color} ${cfg.bg} ${cfg.border}`}
        >
          <Icon className="w-3 h-3 flex-shrink-0" />
          {score} · {label}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${cfg.color}`} />
            <span className="font-semibold text-sm">Intent Score</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-3xl font-bold ${cfg.color}`}>{score}</span>
            <span className="text-sm text-muted-foreground">/ 100 · {label}</span>
          </div>
        </div>

        {reasons.length > 0 && (
          <div className="p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Scoring Breakdown</p>
            <ul className="space-y-1">
              {reasons.map((reason, idx) => (
                <li key={idx} className="text-xs text-foreground/80 flex items-start gap-1.5">
                  <span className={`mt-0.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.color.replace('text-', 'bg-')}`} />
                  {reason}
                </li>
              ))}
            </ul>
          </div>
        )}

        {angle && (
          <div className="px-4 pb-4">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Recommended Angle</p>
            <p className="text-xs text-foreground/80 italic">{angle}</p>
          </div>
        )}

        {reasons.length === 0 && !angle && (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">Enrich this lead to generate a detailed intent breakdown.</p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
