import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { type PlanType } from "@/lib/plan-features";

interface FeatureHighlightProps {
  availableOn: PlanType;
  onUpgrade?: () => void;
  inline?: boolean;
}

export const FeatureHighlight = ({ availableOn, onUpgrade, inline = false }: FeatureHighlightProps) => {
  const planNames: Record<string, string> = {
    starter: 'Starter',
    growth: 'Growth',
    pro: 'Pro',
  };
  const planName = planNames[availableOn] || 'Pro';
  
  if (inline) {
    return (
      <span 
        className="inline-flex items-center gap-1 text-xs text-primary cursor-pointer hover:underline"
        onClick={onUpgrade}
      >
        <Sparkles className="w-3 h-3" />
        Available with {planName}
      </span>
    );
  }

  return (
    <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
      <Sparkles className="w-4 h-4 text-primary" />
      <span className="text-sm text-muted-foreground">Available with {planName}</span>
      {onUpgrade && (
        <Button variant="link" size="sm" className="h-auto p-0 ml-auto" onClick={onUpgrade}>
          Learn more
        </Button>
      )}
    </div>
  );
};
