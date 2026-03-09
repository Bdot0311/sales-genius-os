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
  const isFreeUser = currentPlan === 'free';

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
            <span>
              {isFreeUser 
                ? `Start your 14-day free trial of ${targetPlanInfo.name}`
                : `Available with ${targetPlanInfo.name}`
              }
            </span>
          </div>
          
          <div className="space-y-2">
            {targetPlan === 'starter' && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>400 verified prospects per month</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>Prospect search & verified emails</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>AI email generator & templates</span>
                </div>
              </>
            )}
            {targetPlan === 'growth' && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>1,200 verified prospects per month</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>Advanced filters & bulk export</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>AI personalized outreach & automation</span>
                </div>
              </>
            )}
            {targetPlan === 'pro' && (
              <>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>3,000 verified prospects per month</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  <span>Advanced automation & CRM integrations</span>
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
                  <span>Team collaboration & premium support</span>
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
            {isFreeUser ? 'Start Free Trial' : 'View Plans'}
            <ArrowRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
