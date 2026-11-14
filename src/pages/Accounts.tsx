import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Panel, PanelHeader } from "@/components/dashboard/Panel";
import { supabase } from "@/integrations/supabase/client";
import { AccountCommittee } from "@/components/dashboard/AccountCommittee";
import { WhyNowPanel } from "@/components/dashboard/WhyNowPanel";
import { Building2, ChevronRight } from "lucide-react";

interface Company { id: string; name: string; domain: string | null }

/** Older imports could land without a name — fall back to the domain root so the
 *  list never renders a blank row. */
const displayName = (c: Company) =>
  c.name?.trim() ||
  (c.domain
    ? c.domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0].split(".")[0]
    : "untitled account");

const Accounts = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrichmentVersion, setEnrichmentVersion] = useState(0);
  const handleAccountEnriched = useCallback(() => setEnrichmentVersion((value) => value + 1), []);

  // Reused as the refresh hook after an account is imported from a tech signal,
  // so a newly added company appears in the list without a page reload. The
  // current selection survives the refresh — only an empty or stale one falls
  // back to the first account.
  const loadCompanies = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }
    const { data } = await supabase.from("companies").select("id, name, domain").eq("user_id", session.user.id).order("name").limit(200);
    const list = (data as Company[]) || [];
    setCompanies(list);
    setSelected((prev) => (prev && list.some((c) => c.id === prev.id) ? prev : list[0] || null));
    setLoading(false);
  }, []);

  useEffect(() => { void loadCompanies(); }, [loadCompanies]);

  return (
    <DashboardLayout>
      <PageHeader title="Accounts" description="See who you know across each account's buying committee and where the gaps are" />
      <div className="mx-auto grid max-w-[1400px] gap-4 py-5 md:grid-cols-[260px_1fr]">
        {/* The list is a panel with a header, like every other list in the
            product. It was a bare card whose only contents were rows, so it
            read as a floating menu rather than part of the page — and its
            copy was the one place in the dashboard written in lower case
            throughout, which reads as unfinished rather than as a style. */}
        <Panel className="h-fit">
          <PanelHeader
            title="Accounts"
            meta={loading ? undefined : `${companies.length}`}
          />
          <div className="p-1.5">
            {loading ? (
              <p className="px-2.5 py-2 text-[0.6875rem] text-muted-foreground">Loading accounts…</p>
            ) : companies.length === 0 ? (
              <p className="px-2.5 py-2 text-[0.6875rem] leading-relaxed text-muted-foreground">
                No accounts yet. Saving a lead files it under its company, and companies added by hand
                appear here too.
              </p>
            ) : companies.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.8125rem] transition-colors ${
                  selected?.id === c.id ? "bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Building2 className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
                  <span className="truncate">{displayName(c)}</span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
              </button>
            ))}
          </div>
        </Panel>

        <div className="space-y-4">
          {selected ? (
            <>
              <AccountCommittee companyId={selected.id} companyName={displayName(selected)} companyDomain={selected.domain || undefined} onEnriched={handleAccountEnriched} />
              <WhyNowPanel key={`${selected.id}-${enrichmentVersion}`} companyId={selected.id} />
            </>
          ) : !loading && (
            <Panel>
              <div className="px-5 py-8 text-center">
                <p className="text-[0.8125rem] text-foreground">Pick an account</p>
                <p className="mx-auto mt-1.5 max-w-sm text-[0.6875rem] leading-relaxed text-muted-foreground">
                  Each one shows the buying committee you have contacts for, the roles still missing, and
                  why now is the moment to reach them.
                </p>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Accounts;
