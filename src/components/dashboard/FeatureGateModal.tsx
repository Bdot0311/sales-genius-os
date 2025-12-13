import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, Zap, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { UPGRADE_MESSAGES, PLAN_FEATURES, type UpgradeFeature, type PlanType } from "@/lib/plan-features";

interface FeatureGateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  feature: UpgradeFeature;
  currentPlan: PlanType;
}

export const FeatureGateModal = ({ open, onOpenChange, feature, currentPlan }: FeatureGateModalProps) => {
  const navigate = useNavigate();
  const message = UPGRADE_MESSAGES[feature];
  const targetPlan = message.availableOn as PlanType;
  const targetPlanInfo = PLAN_FEATURES[targetPlan];

  const handleViewPlans = () => {
    onOpenChange(false);
    navigate('/pricing');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Sparkles className="w-6 h-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">{message.title}</DialogTitle>
          <DialogDescription className="text-base pt-2">
            {message.description}
          </DialogDescription>
        </DialogHeader>

        <div className="bg-muted/50 rounded-lg p-4 mt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
            <Zap className="w-4 h-4" />
            <span>Available with {targetPlanInfo.name}</span>
          </div>
          
          <div className="space-y-2">
            {targetPlan === 'pro' && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>5x more lead discovery capacity</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>Advanced filters & AI features</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>Revenue forecasting & analytics</span>
                </div>
              </>
            )}
            {targetPlan === 'elite' && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>Unlimited sequences & automations</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>API access & custom integrations</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>Live coaching & custom playbooks</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
            Maybe Later
          </Button>
          <Button onClick={handleViewPlans} className="flex-1 gap-2">
            View Plans
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
