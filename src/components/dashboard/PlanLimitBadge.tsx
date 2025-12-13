import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles } from "lucide-react";
import { type PlanType } from "@/lib/plan-features";

interface PlanLimitBadgeProps {
  current: number;
  limit: number;
  label?: string;
  showUpgrade?: boolean;
  upgradePlan?: PlanType;
}

export const PlanLimitBadge = ({ 
  current, 
  limit, 
  label = "used",
  showUpgrade = false,
  upgradePlan = 'pro'
}: PlanLimitBadgeProps) => {
  const isUnlimited = limit === -1;
  const percentage = isUnlimited ? 0 : (current / limit) * 100;
  const isNearLimit = percentage >= 80;
  const isAtLimit = percentage >= 100;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={isAtLimit ? "destructive" : isNearLimit ? "secondary" : "outline"}
            className="gap-1"
          >
            {isUnlimited ? (
              <span>Unlimited</span>
            ) : (
              <span>{current.toLocaleString()} / {limit.toLocaleString()} {label}</span>
            )}
            {showUpgrade && isNearLimit && !isUnlimited && (
              <Sparkles className="w-3 h-3" />
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          {isAtLimit ? (
            <p>Limit reached. Higher limits available on {upgradePlan === 'pro' ? 'Pro' : 'Elite'}.</p>
          ) : isNearLimit ? (
            <p>Approaching limit. Consider upgrading for more capacity.</p>
          ) : isUnlimited ? (
            <p>Unlimited on your current plan</p>
          ) : (
            <p>{limit - current} remaining this month</p>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};
