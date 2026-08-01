import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { validateIcp, ValidationLead, ValidationProfile, ValidationResult } from "@/lib/icp-validation";
import { Loader2, AlertTriangle, CheckCircle2, Info } from "lucide-react";

// Renders the ICP validation + breadth check for the profile being edited.
// Everything shown is derived from real lead/reply rows; when there is not
// enough data it says so rather than inventing a claim.
export const ICPValidationPanel = ({ profile }: { profile: ValidationProfile }) => {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: pool } = await supabase
        .from("leads")
        .select("industry, company_size, job_title, country")
        .eq("user_id", session.user.id)
        .limit(500);

      // Replied = leads whose reply was classified positive/high intent.
      const { data: replies } = await supabase
        .from("reply_analysis")
        .select("lead_id, intent_classification")
        .eq("user_id", session.user.id)
        .in("intent_classification", ["high_intent", "positive"]);
      const repliedIds = new Set((replies || []).map((r: any) => r.lead_id).filter(Boolean));

      let repliedLeads: ValidationLead[] = [];
      if (repliedIds.size > 0) {
        const { data: rl } = await supabase
          .from("leads")
          .select("industry, company_size, job_title, country")
          .in("id", Array.from(repliedIds));
        repliedLeads = (rl as ValidationLead[]) || [];
      }

      if (!mounted) return;
      setResult(validateIcp(profile, (pool as ValidationLead[]) || [], repliedLeads));
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [profile]);

  if (loading) return <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground"><Loader2 className="w-3.5 h-3.5 animate-spin" />checking your icp against your leads...</div>;
  if (!result) return null;

  const clean = result.sampleSize >= 10 && !result.tooBroad && result.uselessCriteria.length === 0 && (!result.hasEnoughReplyData || result.replyMismatches.length === 0);

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2 font-medium">
        {clean ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <AlertTriangle className="w-4 h-4 text-yellow-500" />}
        <span>icp validation</span>
      </div>

      {/* Breadth */}
      {result.sampleSize < 10 ? (
        <p className="text-muted-foreground flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />not enough leads yet to check breadth. this fills in as you save leads.</p>
      ) : (
        <>
          {result.tooBroad && (
            <p className="text-yellow-600 dark:text-yellow-500">this icp matches {Math.round((result.matchShare || 0) * 100)}% of your {result.sampleSize} leads, which is likely too broad.</p>
          )}
          {result.uselessCriteria.length > 0 && (
            <p className="text-muted-foreground">these criteria are doing no filtering: {result.uselessCriteria.join(", ")}.</p>
          )}
          {!result.tooBroad && result.uselessCriteria.length === 0 && (
            <p className="text-muted-foreground">breadth looks reasonable: matches {Math.round((result.matchShare || 0) * 100)}% of your {result.sampleSize} leads.</p>
          )}
        </>
      )}

      {/* Reply validation */}
      {!result.hasEnoughReplyData ? (
        <p className="text-muted-foreground flex items-start gap-1.5"><Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />not enough replies yet to validate the icp against who actually replied ({result.replySize} so far, need 5).</p>
      ) : result.replyMismatches.length > 0 ? (
        result.replyMismatches.map((m, i) => <p key={i} className="text-yellow-600 dark:text-yellow-500">{m}.</p>)
      ) : (
        <p className="text-muted-foreground">your replies line up with the stated icp across {result.replySize} replies.</p>
      )}
    </div>
  );
};
