import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, Target, Building2, Users, Code, TrendingUp } from "lucide-react";
import { calculateICPMatch, getScoreColor } from "@/lib/icp-scoring";
import { useICPProfiles, type ICPProfile } from "@/hooks/use-icp-profiles";

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

function MatchRow({ label, icon: Icon, matched }: { label: string; icon: React.ComponentType<{ className?: string }>; matched: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2 text-sm">
        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
        <span>{label}</span>
      </div>
      {matched ? (
        <CheckCircle className="w-4 h-4 text-green-500" />
      ) : (
        <XCircle className="w-4 h-4 text-red-500" />
      )}
    </div>
  );
}

export const ICPScoreBreakdown = ({ lead, score }: ICPScoreBreakdownProps) => {
  const { profiles } = useICPProfiles();
  const displayScore = score ?? lead.icp_score ?? 0;
  const breakdown = calculateICPMatch(lead, profiles);

  const getScoreBadgeVariant = (s: number): "default" | "secondary" | "destructive" => {
    if (s >= 71) return "default";
    if (s >= 41) return "secondary";
    return "destructive";
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Badge
          variant={getScoreBadgeVariant(displayScore)}
          className="cursor-pointer hover:opacity-80 transition-opacity"
        >
          {displayScore}
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

        {breakdown ? (
          <div className="p-4 space-y-0.5">
            <MatchRow label="Job Title Match" icon={TrendingUp} matched={breakdown.title} />
            <MatchRow label="Industry Match" icon={Building2} matched={breakdown.industry} />
            <MatchRow label="Company Size Match" icon={Users} matched={breakdown.size} />
            <MatchRow label="Tech Stack Match" icon={Code} matched={breakdown.tech} />
            <div className="pt-3 mt-2 border-t border-border">
              <p className="text-xs text-muted-foreground">
                Each criterion contributes 25 points. Score is based on your best-matching ICP profile.
              </p>
            </div>
          </div>
        ) : (
          <div className="p-4">
            <p className="text-sm text-muted-foreground">
              {profiles.length === 0
                ? "No ICP profiles configured. Create one in the ICP Builder to see match breakdowns."
                : "Score was set by AI lead scoring. Create an ICP profile for detailed matching."}
            </p>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};
