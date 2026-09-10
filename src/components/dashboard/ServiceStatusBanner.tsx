import { AlertTriangle, X } from "lucide-react";
import { useServiceStatus } from "@/hooks/use-service-status";
import { Button } from "@/components/ui/button";

/**
 * A one-line status notice at the top of the dashboard while a platform-wide
 * problem is open. It says what's affected, what's safe, and that the team is
 * on it — a customer who can see that rarely needs to ask, and rarely churns
 * over a bad five minutes.
 */
export const ServiceStatusBanner = () => {
  const { status, dismiss } = useServiceStatus();
  if (!status) return null;

  const isCritical = status.severity === "critical";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`border-b px-4 py-2.5 sm:px-6 lg:px-8 ${
        isCritical
          ? "border-destructive/40 bg-destructive/10"
          : "border-amber-500/40 bg-amber-500/10"
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
            isCritical ? "text-destructive" : "text-amber-500"
          }`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{status.copy.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{status.copy.body}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={dismiss}
          aria-label="Dismiss status notice"
          className="h-6 w-6 flex-shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
};
