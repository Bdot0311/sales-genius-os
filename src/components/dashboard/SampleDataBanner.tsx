import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

/**
 * A subtle inline banner shown on pages when free-tier users are seeing sample data.
 */
export const SampleDataBanner = () => {
  const navigate = useNavigate();

  return (
    <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="border-primary/30 text-primary text-xs font-medium">
          Sample Data
        </Badge>
        <span className="text-sm text-muted-foreground">
          You're exploring with demo data. Upgrade to see your real numbers.
        </span>
      </div>
      <Button size="sm" variant="default" className="gap-1.5 shrink-0" onClick={() => navigate("/pricing")}>
        <Sparkles className="w-3.5 h-3.5" />
        Upgrade
      </Button>
    </div>
  );
};
