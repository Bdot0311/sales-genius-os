import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Building2, ExternalLink, Loader2, Plus, Radar } from "lucide-react";

interface TechSignal {
  company: string;
  domain: string | null;
  product: string | null;
  category: string | null;
  change: "added" | "removed";
  at: string | null;
  known: boolean;
  id: string | null;
  /** Where the change was observed — links straight to the proof. */
  evidenceUrl: string | null;
  industry: string | null;
  country: string | null;
  sizeRange: string | null;
  description: string | null;
}

interface DiscoverResponse {
  signals?: TechSignal[];
  target?: string;
  vendor_source?: string;
  total_matched?: number;
  truncated?: boolean;
  cached?: boolean;
  reason?: string;
  /** Demo mode answers under `message` rather than `reason`. */
  message?: string;
}

/**
 * Why an empty result came back, whichever field carries it. Without the
 * `message` fallback a demo-mode response renders as a plain empty list with no
 * explanation at all, which is indistinguishable from a genuine no-match.
 */
const explain = (d: DiscoverResponse | null): string | null => d?.reason ?? d?.message ?? null;

type ChangeFilter = "removed" | "added" | "any";

const CHANGE_OPTIONS: { value: ChangeFilter; label: string; hint: string }[] = [
  { value: "removed", label: "dropped it", hint: "companies that churned off this tool" },
  { value: "added", label: "adopted it", hint: "companies that just started using this tool" },
  { value: "any", label: "either", hint: "any recent change" },
];

const relativeDay = (iso: string | null): string => {
  if (!iso) return "recently";
  const days = Math.round((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return "recently";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.round(days / 30);
  return months <= 1 ? "last month" : `${months} months ago`;
};

/**
 * Account discovery from recent technographic changes.
 *
 * Companies that just dropped a tool you displace are the warmest outbound list
 * available, so the default view is churn, and leaving the vendor blank falls
 * back to the competitor tools already set on the user's ICP.
 */
export const TechSignalsPanel = ({ onImported }: { onImported?: () => void }) => {
  const [vendor, setVendor] = useState("");
  const [change, setChange] = useState<ChangeFilter>("removed");
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [signals, setSignals] = useState<TechSignal[]>([]);
  const [meta, setMeta] = useState<DiscoverResponse | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const [imported, setImported] = useState<Set<string>>(new Set());

  const run = async () => {
    setLoading(true);
    setSearched(false);
    try {
      const { data, error } = await supabase.functions.invoke<DiscoverResponse>("discover-tech-signals", {
        body: {
          vendor: vendor.trim() || undefined,
          change: change === "any" ? undefined : change,
        },
      });
      if (error) throw error;
      const found = Array.isArray(data?.signals) ? data.signals : [];
      setSignals(found);
      setMeta(data ?? null);
      setSearched(true);
      const why = explain(data ?? null);
      if (!found.length && why) toast.info(why);
    } catch (e) {
      setSignals([]);
      setMeta(null);
      setSearched(true);
      toast.error("could not load tech signals");
      console.error("[TechSignalsPanel]", e);
    } finally {
      setLoading(false);
    }
  };

  const importCompany = async (s: TechSignal) => {
    const key = s.domain || s.company;
    setImporting(key);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error("sign in to save accounts"); return; }
      // Only name and domain are written. The product is deliberately not
      // seeded into tech_stack: on a churn signal they no longer run it, and a
      // stack that says otherwise would mislead every downstream score.
      const { error } = await supabase.from("companies").insert({
        user_id: session.user.id,
        name: s.company,
        domain: s.domain,
      });
      if (error) {
        // 23505 is now scoped per user, so this really is their own duplicate.
        if (error.code === "23505") toast.info(`${s.company} is already in your accounts`);
        else throw error;
      } else {
        toast.success(`${s.company} added to accounts`);
        onImported?.();
      }
      setImported((prev) => new Set(prev).add(key));
    } catch (e) {
      toast.error("could not add that account");
      console.error("[TechSignalsPanel] import", e);
    } finally {
      setImporting(null);
    }
  };

  const activeHint = CHANGE_OPTIONS.find((o) => o.value === change)?.hint;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Radar className="w-4 h-4 text-primary" />
          Tech signals
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          find accounts by what they just started or stopped running
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label htmlFor="tech-signal-vendor">Tool</Label>
            <Input
              id="tech-signal-vendor"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !loading) run(); }}
              placeholder="e.g. HubSpot — leave blank to use your ICP competitors"
            />
          </div>
          <Button onClick={run} disabled={loading} className="sm:w-auto">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />searching</> : "Find accounts"}
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {CHANGE_OPTIONS.map((o) => (
            <Button
              key={o.value}
              type="button"
              size="sm"
              variant={change === o.value ? "default" : "outline"}
              onClick={() => setChange(o.value)}
            >
              {o.label}
            </Button>
          ))}
          {activeHint && <span className="text-xs text-muted-foreground">{activeHint}</span>}
        </div>

        {meta?.target && searched && (
          <p className="text-xs text-muted-foreground">
            {meta.vendor_source === "icp_exclude_tech_stack"
              ? <>using <span className="text-foreground">{meta.target}</span> from your ICP competitor list</>
              : <>showing changes for <span className="text-foreground">{meta.target}</span></>}
            {meta.truncated && meta.total_matched ? ` · ${meta.total_matched} matched, showing the newest ${signals.length}` : ""}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">looking for recent changes...</p>
        ) : searched && signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {explain(meta) ?? "no recent changes found for that tool. try a different one or widen to either direction."}
          </p>
        ) : (
          <div className="divide-y rounded-md border">
            {signals.map((s) => {
              const key = s.domain || s.company;
              const isImported = imported.has(key);
              return (
                <div key={key} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm font-medium">{s.company}</span>
                      {s.known && <Badge variant="secondary" className="shrink-0">already tracked</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        {s.change === "removed"
                          ? <ArrowDownRight className="w-3 h-3 text-amber-500" />
                          : <ArrowUpRight className="w-3 h-3 text-emerald-500" />}
                        {s.change === "removed" ? "dropped" : "added"}
                        {s.product ? <span className="text-foreground">{s.product}</span> : "a tracked tool"}
                      </span>
                      <span>·</span>
                      <span>{relativeDay(s.at)}</span>
                      {s.evidenceUrl && (
                        <>
                          <span>·</span>
                          <a
                            href={s.evidenceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 underline hover:text-foreground"
                          >
                            evidence<ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </>
                      )}
                    </div>
                    {/* Enough firmographics to disqualify without leaving the panel. */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      {[s.domain, s.industry, s.sizeRange && `${s.sizeRange} staff`, s.country]
                        .filter(Boolean)
                        .map((bit, i) => (
                          <span key={`${key}-bit-${i}`} className="inline-flex items-center gap-2">
                            {i > 0 && <span aria-hidden="true">·</span>}
                            <span className="truncate">{bit}</span>
                          </span>
                        ))}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    disabled={isImported || importing === key}
                    onClick={() => importCompany(s)}
                  >
                    {importing === key
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : isImported ? "added" : <><Plus className="w-3.5 h-3.5 mr-1" />add</>}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
