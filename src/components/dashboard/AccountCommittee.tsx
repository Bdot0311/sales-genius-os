import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, CheckCircle2, Lock } from "lucide-react";

interface Slot {
  label: string;
  seniority_band: string | null;
  function: string | null;
  required: boolean;
  contacts: { id: string; name: string; job_title: string | null; email: string | null }[];
}

interface Candidate {
  job_title?: string;
  company_name?: string;
  company_domain?: string;
  business_email?: string | null;
  contact_name?: string;
  industry?: string;
  company_size?: string;
  country?: string;
  linkedin_url?: string | null;
}

const SENIORITY: Record<string, string> = { cxo: "Chief", c_level: "Chief", vp: "VP", director: "Director", manager: "Manager", ic: "" };
const FUNCTION: Record<string, string> = {
  exec: "Executive", sales: "Sales", marketing: "Marketing",
  technical: "Engineering", finance: "Finance", operations: "Operations", hr: "People",
};
const slotToTitle = (s: Pick<Slot, "seniority_band" | "function">): string | undefined => {
  const band = SENIORITY[(s.seniority_band || "").toLowerCase()] ?? "";
  const fn = FUNCTION[(s.function || "").toLowerCase()] ?? "";
  if ((s.function || "").toLowerCase() === "exec") return band === "Chief" ? "CEO" : "VP";
  return `${band} ${fn}`.trim() || undefined;
};

export const AccountCommittee = ({ companyId, companyName, companyDomain, onEnriched }: { companyId: string; companyName: string; companyDomain?: string; onEnriched?: () => void }) => {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [coverage, setCoverage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState("");

  const saveCandidate = useCallback(async (candidate: Candidate, userId: string) => {
    const email = candidate.business_email?.trim() || null;
    const linkedin = candidate.linkedin_url?.trim() || null;
    if (!candidate.contact_name?.trim() || (!email && !linkedin)) return null;

    let contactId: string | null = null;
    if (email) {
      const { data } = await supabase.from("contacts").select("id").eq("user_id", userId).eq("email", email).maybeSingle();
      contactId = data?.id || null;
    }
    if (!contactId && linkedin) {
      const { data } = await supabase.from("contacts").select("id").eq("user_id", userId).eq("linkedin_url", linkedin).maybeSingle();
      contactId = data?.id || null;
    }

    const name = candidate.contact_name.trim().split(/\s+/);
    if (contactId) {
      await supabase.from("contacts").update({ company_id: companyId, job_title: candidate.job_title || null, lead_status: "active" }).eq("id", contactId).eq("user_id", userId);
    } else {
      const { data, error } = await supabase.from("contacts").insert({
        user_id: userId, company_id: companyId, first_name: name[0] || "", last_name: name.slice(1).join(" "),
        email, job_title: candidate.job_title || null, linkedin_url: linkedin, country: candidate.country || null,
        lead_status: "active", source: "OutReign automatic account enrichment",
      }).select("id").single();
      if (error) return null;
      contactId = data.id;
    }

    let existingLead: { id: string } | null = null;
    if (email) {
      const { data } = await supabase.from("leads").select("id").eq("user_id", userId).eq("company_id", companyId).eq("contact_email", email).maybeSingle();
      existingLead = data;
    }
    if (!existingLead && linkedin) {
      const { data } = await supabase.from("leads").select("id").eq("user_id", userId).eq("company_id", companyId).eq("linkedin_url", linkedin).maybeSingle();
      existingLead = data;
    }
    if (!existingLead) {
      const { data } = await supabase.from("leads").insert({
        user_id: userId, company_id: companyId, company_name: candidate.company_name || companyName,
        contact_name: candidate.contact_name, contact_email: email, job_title: candidate.job_title || null,
        industry: candidate.industry || null, company_size: candidate.company_size || null, linkedin_url: linkedin,
        company_website: candidate.company_domain ? `https://${candidate.company_domain.replace(/^https?:\/\//, "")}` : companyDomain ? `https://${companyDomain.replace(/^https?:\/\//, "")}` : null,
        source: "OutReign automatic account enrichment", lead_status: "active", enrichment_status: "pending",
      }).select("id").single();
      return data?.id || null;
    }
    return null;
  }, [companyDomain, companyId, companyName]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); setErr(""); setGated(false);
      try {
        const mapCommittee = () => supabase.functions.invoke("map-account-committee", { body: { companyId } });
        let { data, error } = await mapCommittee();
        if (!mounted) return;
        if (error) { setErr("could not load the committee right now."); return; }
        if (data?.error_code === "upgrade_required") { setGated(true); return; }
        if (data?.error) { setErr(data.error); return; }
        const gaps = Array.isArray(data?.gaps) ? data.gaps as Slot[] : [];
        if (gaps.length > 0) {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const titles = [...new Set(gaps.map(slotToTitle).filter(Boolean))] as string[];
            const search = await supabase.functions.invoke("fetch-external-leads", { body: {
              companies: [{ name: companyName, domain: companyDomain }], job_titles: titles,
              strict: true, exclude_seen: true, limit: Math.max(8, gaps.length * 3),
            } });
            const candidates = Array.isArray(search.data?.leads) ? search.data.leads as Candidate[] : [];
            const newLeadIds: string[] = [];
            for (const candidate of candidates.slice(0, Math.max(gaps.length, 4))) {
              const leadId = await saveCandidate(candidate, session.user.id);
              if (leadId) newLeadIds.push(leadId);
            }
            if (newLeadIds.length > 0) {
              await Promise.allSettled(newLeadIds.map((leadId) => supabase.functions.invoke("enrich-lead", { body: { leadId } })));
              onEnriched?.();
            }
            if (candidates.length > 0) {
              ({ data, error } = await mapCommittee());
              if (error) { setErr("contacts were sourced, but the committee could not be refreshed."); return; }
            }
          }
        }
        if (!mounted) return;
        setSlots(data?.slots || []);
        setCoverage(data?.coverage || 0);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyDomain, companyId, companyName, onEnriched, saveCandidate]);

  if (loading) return <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />mapping the committee...</div>;
  if (gated) return (
    <div className="flex items-start gap-2 p-3 rounded-md bg-muted/40 text-sm text-muted-foreground">
      <Lock className="w-4 h-4 mt-0.5 shrink-0" />the buying committee map is on pro and agency.
    </div>
  );
  if (err) return <p className="text-sm text-muted-foreground py-4">{err}</p>;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-base">{companyName} committee</CardTitle>
          <span className="text-xs text-muted-foreground">{coverage}% covered</span>
        </div>
        <Progress value={coverage} className="h-1.5 mt-1" />
      </CardHeader>
      <CardContent className="grid sm:grid-cols-2 gap-3">
        {slots.map((s) => (
          <div key={s.label} className="rounded-lg border border-border/60 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{s.label}</span>
              {s.required && <Badge variant="outline" className="text-[10px]">required</Badge>}
            </div>
            {s.contacts.length > 0 ? (
              s.contacts.map((c) => (
                <div key={c.id} className="flex items-center gap-2 text-xs">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                  <span className="min-w-0 truncate"><span className="text-foreground/90">{c.name || c.email}</span>{c.job_title ? ` · ${c.job_title}` : ""}</span>
                </div>
              ))
            ) : (
              <span className="text-xs text-muted-foreground">no verified contact found</span>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
