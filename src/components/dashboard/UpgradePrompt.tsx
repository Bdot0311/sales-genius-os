import { PLAN_LABELS, type PlanType } from "@/lib/plan-features";
import { Panel } from "@/components/dashboard/Panel";
import { Button } from "@/components/ui/button";
import { Lock, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UpgradePromptProps {
  feature: string;
  /*
   * Any plan, not just the two dearest. The type was 'growth' | 'pro', so a
   * free account could not be pointed at Starter -- the plan that actually
   * unlocks sequences -- and both call sites passed "pro" because it was the
   * only value that fitted.
   */
  requiredPlan: PlanType;
}

export const UpgradePrompt = ({ feature, requiredPlan }: UpgradePromptProps) => {
  const navigate = useNavigate();

  return (
    <Panel className="p-12 text-center bg-gradient-subtle border-border/50">
      <div className="max-w-md mx-auto space-y-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h3 className="text-2xl font-bold">Unlock {feature}</h3>
          <p className="text-muted-foreground">
            Upgrade to {PLAN_LABELS[requiredPlan] ?? 'a paid'} to access {feature.toLowerCase()}.
          </p>
        </div>

        <div className="flex gap-3 justify-center">
          <Button 
            variant="hero" 
            size="lg"
            onClick={() => navigate('/pricing')}
            className="gap-2"
          >
            View Plans
            <ArrowUpRight className="w-4 h-4" />
          </Button>
        </div>

        {/*
          * A hardcoded footer used to list what the account already had --
          * lead intelligence, outreach, pipeline, calendar -- and it was
          * shown to every plan, free included, which has no calendar
          * connections and no sequences at all. A fixed list cannot stay
          * true across five plans, so it is gone rather than wrong.
          */}
      </div>
    </Panel>
  );
};
