import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Claim { claim: string; source_url: string; confidence: string }

const CONF: Record<string, string> = {
  high: "text-green-500 border-green-500/30",
  medium: "text-yellow-500 border-yellow-500/30",
  low: "text-slate-400 border-slate-500/25",
};

// Why-now claims for an account. Every rendered claim carries a source link.
// High/medium can feed a personalization token; low-confidence is shown but
// labelled so it never silently reaches a sent email.
export const WhyNowPanel = ({ companyId }: { companyId: string }) => {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [researchedAt, setResearchedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  // Why a run came back empty. "no signals" covered three different situations
  // and none of them were actionable without knowing which one applied.
  const [reason, setReason] = useState<string | null>(null);

  const loadCache = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data } = await supabase.from("why_now_research").select("claims, researched_at").eq("user_id", session.user.id).eq("company_id", companyId).maybeSingle();
    setClaims(Array.isArray(data?.claims) ? (data.claims as unknown as Claim[]) : []);
    setResearchedAt(data?.researched_at || null);
    setLoading(false);
  };
  useEffect(() => { setLoading(true); loadCache(); }, [companyId]);

  const research = async () => {
    setRunning(true);
    setReason(null);
    try {
      const { data, error } = await supabase.functions.invoke("research-account", { body: { companyId, force: true } });
      if (error) throw error;
      if (data?.error_code === "upgrade_required") { toast.error("why-now research is on growth and above."); return; }
      if (data?.error_code === "cap_reached") { toast.error("daily research limit reached, it resets tomorrow."); return; }
      if (data?.error) { toast.error(data.error); return; }
      setClaims(Array.isArray(data?.claims) ? data.claims : []);
      setResearchedAt(data?.researched_at || null);
      if (typeof data?.remaining === "number") setRemaining(data.remaining);
      if (!data?.claims?.length) {
        setReason(typeof data?.reason === "string" ? data.reason : null);
        toast(data?.reason || "no sourced signals to build a why-now from yet.");
      }
    } catch (e: any) {
      toast.error(e?.message || "could not research this account");
    } finally { setRunning(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">why now</CardTitle>
        <div className="flex items-center gap-2">
          {remaining != null && <span className="text-[11px] text-muted-foreground">{remaining} left today</span>}
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={research} disabled={running}>
            {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}research
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />loading...</div>
        ) : claims.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {reason ?? "no why-now yet. run research to pull sourced reasons from this account's detected signals."}
          </p>
        ) : (
          claims.map((c, i) => (
            <div key={i} className="flex items-start gap-2 text-xs py-1.5 border-b border-border/40 last:border-0">
              <Badge variant="outline" className={`text-[10px] shrink-0 ${CONF[c.confidence] || ""}`}>{c.confidence}</Badge>
              <div className="min-w-0 flex-1">
                <p className="text-foreground/80">{c.claim}</p>
                <a href={c.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline">
                  source <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              {c.confidence === "low" && <span className="text-[10px] text-muted-foreground shrink-0">not used in tokens</span>}
            </div>
          ))
        )}
        {researchedAt && <p className="text-[10px] text-muted-foreground pt-1">last researched {new Date(researchedAt).toLocaleDateString()}</p>}
      </CardContent>
    </Card>
  );
};
