import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, UserPlus, CheckCircle2, Lock } from "lucide-react";

interface Slot {
  label: string;
  seniority_band: string | null;
  function: string | null;
  required: boolean;
  contacts: { id: string; name: string; job_title: string | null; email: string | null }[];
}

export const AccountCommittee = ({ companyId, companyName, companyDomain }: { companyId: string; companyName: string; companyDomain?: string }) => {
  const navigate = useNavigate();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [coverage, setCoverage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [gated, setGated] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true); setErr("");
      try {
        const { data, error } = await supabase.functions.invoke("map-account-committee", { body: { companyId } });
        if (!mounted) return;
        if (error) { setErr("could not load the committee right now."); return; }
        if (data?.error_code === "upgrade_required") { setGated(true); return; }
        if (data?.error) { setErr(data.error); return; }
        setSlots(data?.slots || []);
        setCoverage(data?.coverage || 0);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

// Persona slots are described by seniority band + function, not by real job
// titles. Turn them into a title query the lead provider can actually match.
const SENIORITY: Record<string, string> = { cxo: "Chief", vp: "VP", director: "Director", manager: "Manager", ic: "" };
const FUNCTION: Record<string, string> = {
  exec: "Executive", sales: "Sales", marketing: "Marketing",
  technical: "Engineering", finance: "Finance", operations: "Operations", hr: "People",
};
const slotToTitle = (s: Slot): string | undefined => {
  const band = SENIORITY[(s.seniority_band || "").toLowerCase()] ?? "";
  const fn = FUNCTION[(s.function || "").toLowerCase()] ?? "";
  if ((s.function || "").toLowerCase() === "exec") return band === "Chief" ? "CEO" : "VP";
  const title = `${band} ${fn}`.trim();
  return title || undefined;
};

  // Reuse the existing Target-companies prospect flow to fill a gap.
  const sourceRole = (s: Slot) =>
    navigate("/dashboard/leads", {
      state: {
        sourceCompany: { name: companyName, domain: companyDomain },
        sourceRole: s.label,
        sourceTitle: slotToTitle(s),
      },
    });

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
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">no contact yet</span>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => sourceRole(s.label)}>
                  <UserPlus className="w-3 h-3 mr-1" />source this role
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
