import { Panel, PanelBody } from "@/components/dashboard/Panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import type { Verdict, VerdictState } from "@/lib/deliverability-verdict";

/**
 * One metric, told as a diagnosis.
 *
 * Three layers, always in this order: the state in a word, the named cause, and
 * the thing that fixes it. A bare number is what every competitor ships and it
 * puts the diagnosis back on the user — so this component has no mode that
 * renders only a figure. When the data cannot support a cause, the tile says
 * why instead of falling back to one.
 */

const STATE_STYLES: Record<VerdictState, { label: string; badge: string; bar: string }> = {
  healthy:   { label: "Healthy",   badge: "border-green-500/40 text-green-500",       bar: "bg-green-500" },
  degrading: { label: "Degrading", badge: "border-yellow-500/40 text-yellow-500",     bar: "bg-yellow-500" },
  at_risk:   { label: "At risk",   badge: "border-orange-500/40 text-orange-500",     bar: "bg-orange-500" },
  failing:   { label: "Failing",   badge: "border-destructive/40 text-destructive",   bar: "bg-destructive" },
  unknown:   { label: "Not measured", badge: "border-border text-muted-foreground",   bar: "bg-muted-foreground/40" },
};

interface Props {
  title: string;
  icon?: ReactNode;
  verdict: Verdict;
  onAction?: (verdict: Verdict) => void;
  /**
   * Locked tiles show the state layer only.
   *
   * The cause and the action are the product, so a locked tile shows what it
   * would tell you rather than a generic paywall — the upgrade path is the
   * demo, not a wall.
   */
  locked?: boolean;
  lockedHint?: string;
  onUpgrade?: () => void;
}

export const VerdictTile = ({
  title, icon, verdict, onAction, locked = false, lockedHint, onUpgrade,
}: Props) => {
  const style = STATE_STYLES[verdict.state];

  return (
    <Panel className="relative overflow-hidden border-border/50">
      {/* The state, readable before any text is */}
      <div className={`absolute inset-x-0 top-0 h-0.5 ${style.bar}`} aria-hidden="true" />
      <PanelBody className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            {icon}
            {title}
          </div>
          <Badge variant="outline" className={style.badge}>{style.label}</Badge>
        </div>

        {verdict.value && (
          <p className="text-xl font-semibold tabular-nums leading-none">{verdict.value}</p>
        )}

        {locked ? (
          <div className="space-y-2 rounded-md border border-dashed border-border/70 p-3">
            <p className="flex items-center gap-1.5 text-xs font-medium">
              <Lock className="h-3 w-3" />
              {lockedHint ?? "The cause and the fix are on Growth"}
            </p>
            <p className="text-xs text-muted-foreground">
              This tile knows why {title.toLowerCase()} is {style.label.toLowerCase()} and what to change.
              Upgrading turns the diagnosis on.
            </p>
            {onUpgrade && (
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onUpgrade}>
                See plans
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm leading-snug text-foreground/90">
              {verdict.cause ?? verdict.unknownReason}
            </p>
            {verdict.action && onAction && (
              <Button
                size="sm"
                variant={verdict.state === "failing" ? "default" : "outline"}
                className="h-8 text-xs"
                onClick={() => onAction(verdict)}
              >
                {verdict.action.label}
              </Button>
            )}
          </>
        )}
      </PanelBody>
    </Panel>
  );
};
