import { Button } from "@/components/ui/button";
import { Lock, ArrowRight, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface FreeTierOverlayProps {
  /** The page/feature name shown in the overlay */
  feature: string;
  /** Short description of what upgrading unlocks */
  description?: string;
  children: React.ReactNode;
}

/**
 * Wraps page content with sample data in a view-only overlay for free-tier users.
 * Shows a frosted glass upgrade prompt over blurred, non-interactive content.
 */
export const FreeTierOverlay = ({ feature, description, children }: FreeTierOverlayProps) => {
  const navigate = useNavigate();

  return (
    <div className="relative">
      {/* Sample content rendered beneath — pointer-events disabled, slightly blurred */}
      <div className="pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>

      {/* Frosted overlay */}
      <div className="absolute inset-0 z-10 flex items-start justify-center pt-24 md:pt-32">
        {/* Gradient fade at top so content peeks through */}
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background/90" />

        <div className="relative z-20 max-w-md w-full mx-4 rounded-2xl border border-border bg-card/95 backdrop-blur-md shadow-2xl p-8 text-center">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-7 h-7 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">{feature}</h3>
          <p className="text-muted-foreground text-sm leading-relaxed mb-2">
            {description || `You're viewing sample data. Upgrade to a paid plan to unlock full ${feature.toLowerCase()} access.`}
          </p>
          <p className="text-xs text-muted-foreground/70 mb-6">
            Free plan includes view-only access to explore the platform
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={() => navigate("/pricing")} className="gap-2">
              <Sparkles className="w-4 h-4" />
              View Plans
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
