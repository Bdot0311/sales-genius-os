import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Users, AlertTriangle, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useProspectUsage } from "@/hooks/use-prospect-usage";

export const ProspectUsageMeter = () => {
  const navigate = useNavigate();
  const { usage, loading } = useProspectUsage();

  if (loading || !usage) {
    return (
      <Card className="p-4 bg-card border-border animate-pulse">
        <div className="h-20 bg-muted rounded" />
      </Card>
    );
  }

  const { 
    monthlyUsed, 
    monthlyLimit, 
    dailyUsed, 
    dailyLimit,
    plan 
  } = usage;

  const monthlyPercentage = monthlyLimit > 0 ? (monthlyUsed / monthlyLimit) * 100 : 0;
  const dailyPercentage = dailyLimit > 0 ? (dailyUsed / dailyLimit) * 100 : 0;
  
  const isMonthlyNearLimit = monthlyPercentage >= 80;
  const isMonthlyAtLimit = monthlyPercentage >= 100;
  const isDailyAtLimit = dailyPercentage >= 100;

  if (plan === 'free') {
    return (
      <Card className="p-4 bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">Upgrade to unlock prospects</p>
              <p className="text-xs text-muted-foreground">Get verified prospect data with a paid plan</p>
            </div>
          </div>
          <Button size="sm" onClick={() => navigate('/pricing')} className="gap-1">
            View Plans <ArrowUpRight className="w-3 h-3" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 ${isMonthlyAtLimit ? 'bg-destructive/5 border-destructive/30' : 'bg-card border-border'}`}>
      <div className="space-y-4">
        {/* Monthly Usage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Users className={`w-4 h-4 ${isMonthlyAtLimit ? 'text-destructive' : 'text-primary'}`} />
              <span className="text-sm font-medium">Monthly Prospects</span>
            </div>
            <span className={`text-sm font-semibold ${isMonthlyAtLimit ? 'text-destructive' : isMonthlyNearLimit ? 'text-amber-500' : ''}`}>
              {monthlyUsed.toLocaleString()} / {monthlyLimit.toLocaleString()}
            </span>
          </div>
          <Progress 
            value={Math.min(monthlyPercentage, 100)} 
            className={`h-2 ${isMonthlyAtLimit ? '[&>div]:bg-destructive' : isMonthlyNearLimit ? '[&>div]:bg-amber-500' : ''}`}
          />
        </div>

        {/* Daily Usage */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Today's usage</span>
            <span className={`text-xs font-medium ${isDailyAtLimit ? 'text-destructive' : ''}`}>
              {dailyUsed} / {dailyLimit}
            </span>
          </div>
          <Progress 
            value={Math.min(dailyPercentage, 100)} 
            className={`h-1.5 ${isDailyAtLimit ? '[&>div]:bg-destructive' : ''}`}
          />
        </div>

        {/* Warning Messages */}
        {isMonthlyAtLimit && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-destructive">Monthly limit reached</p>
              <p className="text-xs text-muted-foreground">
                Upgrade your plan or purchase additional prospect packs.
              </p>
              <Button 
                size="sm" 
                variant="outline"
                className="mt-2 h-7 text-xs"
                onClick={() => navigate('/pricing')}
              >
                View Plans
              </Button>
            </div>
          </div>
        )}

        {isDailyAtLimit && !isMonthlyAtLimit && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">Daily limit reached</p>
              <p className="text-xs text-muted-foreground">
                Please try again tomorrow.
              </p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
