import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink } from "lucide-react";

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
  // Why a run came back empty. "no signals" covered three different situations
  // and none of them were actionable without knowing which one applied.
  const [reason, setReason] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); setRunning(false); setReason(null); setClaims([]); setResearchedAt(null);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (mounted) setLoading(false); return; }
      const { data: cached } = await supabase.from("why_now_research").select("claims, researched_at")
        .eq("user_id", session.user.id).eq("company_id", companyId).maybeSingle();
      if (!mounted) return;
      const cachedClaims = Array.isArray(cached?.claims) ? cached.claims as unknown as Claim[] : [];
      setClaims(cachedClaims); setResearchedAt(cached?.researched_at || null); setLoading(false); setRunning(true);
      try {
        const { data, error } = await supabase.functions.invoke("research-account", { body: { companyId } });
        if (!mounted) return;
        if (error) { setReason(cachedClaims.length ? null : "could not research this account right now."); return; }
        if (data?.error_code === "upgrade_required") { setReason("automatic why-now research is available on growth and above."); return; }
        if (data?.error_code === "cap_reached") { setReason("daily research limit reached; automatic research will retry tomorrow."); return; }
        const nextClaims = Array.isArray(data?.claims) ? data.claims as Claim[] : [];
        setClaims(nextClaims.length ? nextClaims : cachedClaims);
        setResearchedAt(data?.researched_at || cached?.researched_at || null);
        if (!nextClaims.length && !cachedClaims.length) {
          setReason(typeof data?.reason === "string" ? data.reason : data?.error || "no sourced signals were found for this account yet.");
        }
      } finally { if (mounted) setRunning(false); }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3">
        <CardTitle className="text-base">why now</CardTitle>
        {running && <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" />researching automatically</span>}
      </CardHeader>
      <CardContent className="space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />loading...</div>
        ) : claims.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {reason ?? "researching sourced reasons from this account's detected signals."}
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
