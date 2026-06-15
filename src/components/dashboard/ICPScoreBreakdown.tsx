import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Minus, Target, Building2, Users, Code, TrendingUp } from "lucide-react";
import { calculateICPMatch, getScoreColor } from "@/lib/icp-scoring";
import { useICPProfiles } from "@/hooks/use-icp-profiles";

interface Lead {
  job_title?: string | null;
  industry?: string | null;
  company_size?: string | null;
  employee_count?: string | null;
  technologies?: string[] | null;
  icp_score?: number | null;
}

interface ICPScoreBreakdownProps {
  lead: Lead;
  score?: number | null;
}

function MatchRow({
  label,
  icon: Icon,
  evaluated,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  evaluated: boolean | null; // true=match, false=no match, null=no data
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span className={evaluated === null ? "text-muted-foreground" : ""}>{label}</span>
      </div>
      {evaluated === true ? (
        <CheckCircle className="w-4 h-4 text-green-500" />
      ) : evaluated === false ? (
        <XCircle className="w-4 h-4 text-red-500" />
      ) : (
        <Minus className="w-4 h-4 text-muted-foreground/50" title="No data available" />
      )}
    </div>
  );
}

export const ICPScoreBreakdown = ({ lead, score }: ICPScoreBreakdownProps) => {
  const { profiles } = useICPProfiles();
  // Always use the stored AI score as the authoritative display value.
  // The live profile-based recalculation drives the criteria rows only.
  const displayScore = score ?? lead.icp_score ?? 0;
  const breakdown = calculateICPMatch(lead, profiles);

  const getScoreBadgeVariant = (s: number): "default" | "secondary" | "destructive" => {
    if (s >= 71) return "default";
    if (s >= 41) return "secondary";
    return "destructive";
  };

  const showProfileBreakdown = breakdown && breakdown.hasEnoughData;
  const showDataWarning = breakdown && !breakdown.hasEnoughData && displayScore > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant={getScoreBadgeVariant(displayScore)}
          className="cursor-pointer hover:opacity-80 transition-opacity"
        >
          {displayScore}% ICP
        </Badge>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">ICP Score Breakdown</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-primary">{displayScore}</span>
            <span className="text-sm text-muted-foreground">/ 100</span>
          </div>
        </div>

        {profiles.length === 0 ? (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              No ICP profiles configured. Create one in the ICP Builder to see match breakdowns.
            </p>
          </div>
        ) : showProfileBreakdown ? (
          <div className="p-4 space-y-0.5">
            <MatchRow label="Job Title Match" icon={TrendingUp} evaluated={breakdown.titleEval} />
            <MatchRow label="Industry Match" icon={Building2} evaluated={breakdown.industryEval} />
            <MatchRow label="Company Size Match" icon={Users} evaluated={breakdown.sizeEval} />
            <MatchRow label="Tech Stack Match" icon={Code} evaluated={breakdown.techEval} />
            <div className="pt-3 mt-2 border-t border-border space-y-1">
              <p className="text-xs text-muted-foreground">
                Each criterion contributes 25 points. Score is based on your best-matching ICP profile.
              </p>
              {breakdown.titleEval === null || breakdown.industryEval === null || breakdown.sizeEval === null ? (
                <p className="text-xs text-muted-foreground/70">
                  — means the lead is missing that field's data.
                </p>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-2">
            {showDataWarning && (
              <div className="space-y-0.5 opacity-60">
                <MatchRow label="Job Title Match" icon={TrendingUp} evaluated={breakdown.titleEval} />
                <MatchRow label="Industry Match" icon={Building2} evaluated={breakdown.industryEval} />
                <MatchRow label="Company Size Match" icon={Users} evaluated={breakdown.sizeEval} />
                <MatchRow label="Tech Stack Match" icon={Code} evaluated={breakdown.techEval} />
              </div>
            )}
            <p className="text-xs text-muted-foreground pt-1">
              Score of {displayScore} was set by AI during lead discovery. Most profile criteria
              can't be evaluated — enrich this lead to populate industry, company size, and tech
              stack data.
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
