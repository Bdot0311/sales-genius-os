import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { Loader2 } from "lucide-react";

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

  if (loading) {
    return (
      <Panel>
        <div className="flex items-center gap-2 px-5 py-6 text-[0.8125rem] text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          Mapping the committee…
        </div>
      </Panel>
    );
  }
  if (gated) {
    return (
      <Panel>
        <div className="px-5 py-8 text-center">
          <p className="text-[0.8125rem] font-medium text-foreground">The buying committee map is on Pro and Agency</p>
          <p className="mx-auto mt-1.5 max-w-sm text-[0.6875rem] leading-relaxed text-muted-foreground">
            It shows which roles in an account you already have a verified contact for, and which you do not.
          </p>
        </div>
      </Panel>
    );
  }
  if (err) {
    return (
      <Panel>
        <p className="px-5 py-6 text-[0.8125rem] text-muted-foreground">{err}</p>
      </Panel>
    );
  }

  const covered = slots.filter((s) => s.contacts.length > 0).length;

  /* Rows on one surface, not a grid of bordered boxes inside a bordered card.
     Each slot was its own rounded border nested in the card's, which is a card
     inside a card, and a required marker was a badge saying so on every one —
     a label repeated on most items labels nothing. The gap is the point, so
     the rows that are empty are the ones that read differently. */
  return (
    <Panel>
      <PanelHeader
        title={`${companyName} committee`}
        meta={`${covered} of ${slots.length} roles covered`}
      />
      <div className="h-0.5 bg-muted/30">
        <div className="h-full bg-primary/70 transition-all" style={{ width: `${coverage}%` }} />
      </div>
      <div>
        {slots.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 sm:px-5 ${
              i > 0 ? "border-t border-border/30" : ""
            }`}
          >
            <span className="flex items-baseline gap-2 text-[0.8125rem]">
              <span className={s.contacts.length > 0 ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
              {s.required && s.contacts.length === 0 && (
                <span className="text-[0.625rem] uppercase tracking-[0.1em] text-amber-500/80">needed</span>
              )}
            </span>
            {s.contacts.length > 0 ? (
              <span className="min-w-0 text-right text-[0.6875rem] text-muted-foreground">
                {s.contacts.map((c) => (
                  <span key={c.id} className="block truncate">
                    <span className="text-foreground/90">{c.name || c.email}</span>
                    {c.job_title ? ` · ${c.job_title}` : ""}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-[0.6875rem] text-muted-foreground/60">no contact yet</span>
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
};
