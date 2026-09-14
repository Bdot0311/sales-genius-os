import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelHeader, PanelFooter } from "@/components/dashboard/Panel";
import { Loader2, ExternalLink } from "lucide-react";

interface Claim { claim: string; source_url: string; confidence: string }

/* Confidence as a ramp, not three unrelated colours. The border halves went
   with the pill they outlined. */
const CONF: Record<string, string> = {
  high: "text-emerald-400/90",
  medium: "text-amber-400/80",
  low: "text-muted-foreground/60",
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
    <Panel>
      <PanelHeader
        title="Why now"
        meta={
          running ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Researching
            </span>
          ) : undefined
        }
      />
      {loading ? (
        <p className="flex items-center gap-2 px-4 py-4 text-[0.8125rem] text-muted-foreground sm:px-5">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Loading…
        </p>
      ) : claims.length === 0 ? (
        <p className="px-4 py-4 text-[0.6875rem] leading-relaxed text-muted-foreground sm:px-5">
          {reason ?? "Researching sourced reasons from this account's detected signals."}
        </p>
      ) : (
        /* One claim per row, divided by a hairline. Confidence leads the row as
           a word at the scale of the rest of the chrome, rather than as an
           outlined pill per row — twenty pills down a column is a texture, not
           a signal. */
        <div>
          {claims.map((c, i) => (
            <div
              key={i}
              className={`flex items-start gap-3 px-4 py-2.5 sm:px-5 ${i > 0 ? "border-t border-border/30" : ""}`}
            >
              <span className={`w-12 shrink-0 pt-0.5 text-[0.625rem] uppercase tracking-[0.08em] ${CONF[c.confidence] || "text-muted-foreground"}`}>
                {c.confidence}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] leading-relaxed text-foreground/90">{c.claim}</p>
                <a
                  href={c.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] text-muted-foreground transition-colors hover:text-primary"
                >
                  Source <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              </div>
              {c.confidence === "low" && (
                <span className="shrink-0 pt-0.5 text-[0.625rem] text-muted-foreground/60">not used in tokens</span>
              )}
            </div>
          ))}
        </div>
      )}
      {researchedAt && (
        <PanelFooter>Last researched {new Date(researchedAt).toLocaleDateString()}</PanelFooter>
      )}
    </Panel>
  );
};
