import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LeadResearchObservation {
  fact: string;
  source?: string;
}

export interface LeadResearchQuality {
  score: number;
  label: string;
  safe_to_personalize: boolean;
  gaps?: string[] | null;
}

export interface LeadResearch {
  what_they_do?: string | null;
  who_they_sell_to?: string | null;
  observations?: LeadResearchObservation[] | null;
  hooks?: string[] | null;
  avoid?: string[] | null;
  confidence?: string | null;
  sources?: string[] | null;
  researched_at?: string | null;
  quality?: LeadResearchQuality | null;
}

const CONFIDENCE_COPY: Record<string, string> = {
  high: "Strong findings from their site",
  medium: "Some findings from their site",
  low: "Thin site — email leans on your lead data",
};

function formatWhen(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "researched today";
  if (days === 1) return "researched yesterday";
  return `researched ${days} days ago`;
}

interface LeadResearchPanelProps {
  research?: LeadResearch | null;
  loading?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Shown when there is no brief yet. */
  emptyMessage?: string;
  defaultOpen?: boolean;
  className?: string;
  compact?: boolean;
}

export const LeadResearchPanel = ({
  research,
  loading = false,
  onRefresh,
  refreshing = false,
  emptyMessage = "No research yet — generating an email will read this prospect's website first.",
  defaultOpen = false,
  className,
  compact = false,
}: LeadResearchPanelProps) => {
  const [open, setOpen] = useState(defaultOpen);

  const observations = research?.observations?.filter((o) => o?.fact) ?? [];
  const hooks = research?.hooks?.filter(Boolean) ?? [];
  const confidence = (research?.confidence || "").toLowerCase();
  const hasBrief = Boolean(research && (observations.length > 0 || research.what_they_do));
  const quality = research?.quality ?? null;
  const tooThin = Boolean(quality && !quality.safe_to_personalize);
  const gaps = quality?.gaps?.filter(Boolean) ?? [];

  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-muted/20",
        compact ? "text-xs" : "text-sm",
        className,
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <CollapsibleTrigger className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <Search className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="font-medium">Lead research</span>
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : hasBrief ? (
              <>
                <Badge variant="secondary" className="text-[10px]">
                  {observations.length} finding{observations.length === 1 ? "" : "s"}
                </Badge>
                {quality && (
                  <Badge
                    variant={quality.safe_to_personalize ? "secondary" : "destructive"}
                    className="text-[10px]"
                  >
                    {quality.score}/100 {quality.label}
                  </Badge>
                )}
                {confidence && (
                  <Badge
                    variant={confidence === "low" ? "outline" : "secondary"}
                    className="text-[10px] capitalize"
                  >
                    {confidence} confidence
                  </Badge>
                )}
              </>
            ) : (
              <span className="truncate text-xs text-muted-foreground">not researched yet</span>
            )}
            <ChevronDown
              className={cn(
                "ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
          {onRefresh && (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 shrink-0 px-2 text-xs"
              onClick={onRefresh}
              disabled={refreshing || loading}
            >
              {refreshing ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3" />
              )}
              Refresh
            </Button>
          )}
        </div>

        <CollapsibleContent>
          <div className="space-y-3 border-t border-border/60 px-3 py-3">
            {loading && (
              <p className="text-xs text-muted-foreground">Reading their website…</p>
            )}

            {!loading && !hasBrief && (
              <p className="text-xs text-muted-foreground">{emptyMessage}</p>
            )}

            {!loading && (tooThin || (quality && quality.label === "thin")) && (
              <div
                className={cn(
                  "flex items-start gap-2 rounded-md border p-2 text-xs",
                  tooThin
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-border bg-muted/50 text-muted-foreground",
                )}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-medium">
                    {tooThin
                      ? `Research completeness ${quality?.score}/100 — too thin to personalize safely`
                      : `Research completeness ${quality?.score}/100 — thin`}
                  </p>
                  <p>
                    {tooThin
                      ? "Emails will avoid company-specific claims. Refresh research or add their website to improve this."
                      : "Only reference the findings below; anything else risks sounding invented."}
                  </p>
                  {gaps.length > 0 && <p className="opacity-80">Missing: {gaps.join(" · ")}</p>}
                </div>
              </div>
            )}

            {!loading && hasBrief && (
              <>
                {research?.what_they_do && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      What they do
                    </div>
                    <p className="mt-0.5">{research.what_they_do}</p>
                  </div>
                )}

                {research?.who_they_sell_to && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Who they sell to
                    </div>
                    <p className="mt-0.5">{research.who_they_sell_to}</p>
                  </div>
                )}

                {observations.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Observed on their site
                    </div>
                    <ul className="mt-1 space-y-1.5">
                      {observations.map((o, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                          <span>
                            {o.fact}
                            {o.source && (
                              <a
                                href={o.source}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="ml-1 inline-flex items-center text-primary hover:underline"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span className="sr-only">Open source page</span>
                              </a>
                            )}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {hooks.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      Personalization angles
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {hooks.map((h, i) => (
                        <Badge key={i} variant="outline" className="whitespace-normal text-left text-[10px]">
                          {h}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground">
                  {[CONFIDENCE_COPY[confidence], formatWhen(research?.researched_at)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default LeadResearchPanel;
