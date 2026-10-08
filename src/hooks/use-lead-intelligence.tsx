import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { decisionFromRow, type LeadDecision } from "@/lib/lead-intelligence";

/**
 * Saved lead evaluations, plus the on-demand re-evaluate action.
 *
 * Components never talk to the decision provider — they call this hook, which
 * reads saved decisions from the database and asks the backend to evaluate.
 * When the feature is off or the provider is down, `enabled` is false or the
 * decision comes back unavailable, and every caller falls back to what it did
 * before the layer existed.
 */
export function useLeadIntelligence(leadIds: string[] = []) {
  const [decisions, setDecisions] = useState<Record<string, LeadDecision>>({});
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [evaluating, setEvaluating] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Keyed on the id list so a changing array identity does not refetch forever.
  const key = leadIds.length ? [...leadIds].sort().join(",") : "";
  const keyRef = useRef(key);
  keyRef.current = key;

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: flag } = await supabase.rpc("lead_intelligence_enabled");
      if (!active) return;
      const on = flag === true;
      setEnabled(on);
      if (!on) {
        setLoading(false);
        return;
      }
      const ids = key ? key.split(",") : [];
      if (ids.length === 0) {
        setDecisions({});
        setLoading(false);
        return;
      }
      const { data } = await supabase
        .from("lead_decisions")
        .select("*")
        .in("lead_id", ids.slice(0, 1000));
      if (!active) return;
      const next: Record<string, LeadDecision> = {};
      (data ?? []).forEach((row) => {
        const decision = decisionFromRow(row as Record<string, any>);
        next[decision.lead_id] = decision;
      });
      setDecisions(next);
      setLoading(false);
    })();
    return () => { active = false; };
  }, [key]);

  const evaluate = useCallback(async (ids: string[], options: { force?: boolean } = {}) => {
    const all = ids.filter(Boolean);
    if (all.length === 0) return;

    // The backend accepts 10 leads per call (provider rate limits). Larger
    // selections are evaluated in sequential batches of 10.
    const batches: string[][] = [];
    for (let i = 0; i < all.length; i += 10) batches.push(all.slice(i, i + 10));

    setEvaluating((prev) => new Set([...prev, ...all]));
    try {
      // A stale access token is the common failure here (a tab or phone left
      // open). Refresh it first so the customer never sees a raw failure.
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast({
          title: "Sign in again",
          description: "Your session expired. Sign in again to evaluate leads.",
          variant: "destructive",
        });
        return;
      }

      let evaluated = 0;
      let firstFailure: string | null = null;
      for (const batch of batches) {
        const { data, error } = await supabase.functions.invoke("evaluate-lead", {
          body: { leadIds: batch, force: options.force === true },
        });
        if (error) {
          // Surface whatever the backend said rather than "non-2xx status code".
          let message = "Try again in a moment.";
          try {
            const body = await (error as any)?.context?.json?.();
            if (body?.error) message = body.error;
          } catch { /* keep the fallback */ }
          firstFailure = firstFailure ?? message;
          break;
        }
        if (data?.disabled) {
          setEnabled(false);
          return;
        }
        if (data?.signed_out) {
          toast({
            title: "Sign in again",
            description: data.error,
            variant: "destructive",
          });
          return;
        }
        if (data?.error) {
          firstFailure = firstFailure ?? data.error;
          break;
        }
        const returned = (data?.decisions ?? {}) as Record<string, LeadDecision>;
        const unavailable = Object.values(returned).filter((d) => d.status !== "ok");
        setDecisions((prev) => {
          const next = { ...prev };
          Object.entries(returned).forEach(([id, decision]) => {
            if (decision.status === "ok") next[id] = decision;
          });
          return next;
        });
        evaluated += batch.length - unavailable.length;
        if (unavailable.length > 0) {
          firstFailure = firstFailure ?? (unavailable[0].error_message || "Try again in a moment.");
          break;
        }
        setEvaluating((prev) => {
          const next = new Set(prev);
          batch.forEach((id) => next.delete(id));
          return next;
        });
      }
      if (firstFailure) {
        toast({
          title: "Could not evaluate",
          description: evaluated > 0 ? `Evaluated ${evaluated}, then: ${firstFailure}` : firstFailure,
          variant: "destructive",
        });
      } else {
        toast({
          title: all.length > 1 ? `${all.length} leads evaluated` : "Lead evaluated",
          description: "Fit, intent, priority and email strategy are up to date.",
        });
      }
    } catch (err) {
      toast({
        title: "Could not evaluate",
        description: err instanceof Error ? err.message : "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setEvaluating((prev) => {
        const next = new Set(prev);
        all.forEach((id) => next.delete(id));
        return next;
      });
    }
  }, [toast]);

  return { decisions, enabled, loading, evaluating, evaluate };
}
