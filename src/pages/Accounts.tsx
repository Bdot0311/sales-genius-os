import { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { AccountCommittee } from "@/components/dashboard/AccountCommittee";
import { WhyNowPanel } from "@/components/dashboard/WhyNowPanel";
import { TechSignalsPanel } from "@/components/dashboard/TechSignalsPanel";
import { Building2, ChevronRight } from "lucide-react";

interface Company { id: string; name: string; domain: string | null }

const Accounts = () => {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selected, setSelected] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);

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
      <div className="px-6 py-6 max-w-[1400px] mx-auto grid md:grid-cols-[280px_1fr] gap-6">
        <Card>
          <CardContent className="p-2">
            {loading ? (
              <p className="text-sm text-muted-foreground p-3">loading accounts...</p>
            ) : companies.length === 0 ? (
              <p className="text-sm text-muted-foreground p-3">no accounts yet. save leads or add companies to see their committees here.</p>
            ) : companies.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelected(c)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md text-left text-sm ${selected?.id === c.id ? "bg-muted" : "hover:bg-muted/40"}`}
              >
                <span className="flex items-center gap-2 min-w-0"><Building2 className="w-3.5 h-3.5 shrink-0 text-muted-foreground" /><span className="truncate">{c.name}</span></span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          {selected ? (
            <>
              <AccountCommittee companyId={selected.id} companyName={selected.name} companyDomain={selected.domain || undefined} />
              <WhyNowPanel companyId={selected.id} />
            </>
          ) : !loading && (
            <p className="text-sm text-muted-foreground">pick an account to see its committee.</p>
          )}
          {/* Sits below the committee so it reads as "find more accounts" once
              there are some, and as the obvious next step when there are none. */}
          <TechSignalsPanel onImported={loadCompanies} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default Accounts;
