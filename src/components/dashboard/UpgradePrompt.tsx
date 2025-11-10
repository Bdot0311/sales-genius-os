import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Lock, ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface UpgradePromptProps {
  feature: string;
  requiredPlan: 'pro' | 'elite';
}

export const UpgradePrompt = ({ feature, requiredPlan }: UpgradePromptProps) => {
  const navigate = useNavigate();

  return (
    <Card className="p-12 text-center bg-gradient-subtle border-border/50">
      <div className="max-w-md mx-auto space-y-6">
        <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        
        <div className="space-y-2">
          <h3 className="text-2xl font-bold">Unlock {feature}</h3>
          <p className="text-muted-foreground">
            Upgrade to {requiredPlan === 'pro' ? 'Pro' : 'Elite'} plan to access {feature.toLowerCase()} and supercharge your sales workflow.
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

        <div className="pt-4 border-t border-border/50">
          <p className="text-sm text-muted-foreground">
            Current plan includes: Lead Intelligence, AI Outreach, Smart Pipeline, and Calendar Integration
          </p>
        </div>
      </div>
    </Card>
  );
};
