import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import type { ICPProfile } from "@/hooks/use-icp-profiles";
import { calculateICPMatch, getScoreColor } from "@/lib/icp-scoring";
import { Sparkles, Building2, User, ExternalLink, Target, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: ICPProfile | null;
}

interface ScoredLead {
  id: string;
  company_name: string | null;
  contact_name: string | null;
  job_title: string | null;
  industry: string | null;
  employee_count: string | null;
  company_size: string | null;
  technologies: string[] | null;
  department: string | null;
  seniority: string | null;
  score: number;
  matched: { title: boolean; industry: boolean; size: boolean; tech: boolean; seniority: boolean; department: boolean; excluded: boolean };
  reasons: string[];
}

function scoreLead(lead: any, profile: ICPProfile): ScoredLead {
  const base = calculateICPMatch(lead, [profile]) ?? { title: false, industry: false, size: false, tech: false, score: 0 };

  const reasons: string[] = [];
  if (base.title) reasons.push("Title match");
  if (base.industry) reasons.push("Industry match");
  if (base.size) reasons.push("Company size match");
  if (base.tech) reasons.push("Tech stack overlap");

  // Bonus: seniority & department alignment
  let seniorityMatch = false;
  if (lead.seniority && profile.seniority_levels?.length) {
    const s = String(lead.seniority).toLowerCase();
    seniorityMatch = profile.seniority_levels.some((x) => s.includes(x.toLowerCase()) || x.toLowerCase().includes(s));
    if (seniorityMatch) reasons.push("Seniority match");
  }
  let departmentMatch = false;
  if (lead.department && profile.departments?.length) {
    const d = String(lead.department).toLowerCase();
    departmentMatch = profile.departments.some((x) => d.includes(x.toLowerCase()) || x.toLowerCase().includes(d));
    if (departmentMatch) reasons.push("Department match");
  }

  // Exclusions reduce score significantly
  let excluded = false;
  const titleLower = (lead.job_title || "").toLowerCase();
  const industryLower = (lead.industry || "").toLowerCase();
  if (profile.exclude_titles?.length && profile.exclude_titles.some((t) => titleLower.includes(t.toLowerCase()))) {
    excluded = true; reasons.push("⚠ Excluded title");
  }
  if (profile.exclude_industries?.length && profile.exclude_industries.some((t) => industryLower.includes(t.toLowerCase()))) {
    excluded = true; reasons.push("⚠ Excluded industry");
  }
  if (profile.exclude_keywords?.length) {
    const blob = `${titleLower} ${industryLower} ${(lead.company_name || "").toLowerCase()}`;
    if (profile.exclude_keywords.some((k) => blob.includes(k.toLowerCase()))) {
      excluded = true; reasons.push("⚠ Excluded keyword");
    }
  }

  // Final score: base (capped 100) + bonuses, then exclusion penalty
  let score = base.score;
  if (seniorityMatch) score += 10;
  if (departmentMatch) score += 10;
  score = Math.min(score, 100);
  if (excluded) score = Math.max(0, score - 60);

  return {
    id: lead.id,
    company_name: lead.company_name,
    contact_name: lead.contact_name,
    job_title: lead.job_title,
    industry: lead.industry,
    employee_count: lead.employee_count,
    company_size: lead.company_size,
    technologies: lead.technologies,
    department: lead.department,
    seniority: lead.seniority,
    score,
    matched: { ...base, seniority: seniorityMatch, department: departmentMatch, excluded },
    reasons,
  };
}

export function ICPLookalikesDialog({ open, onOpenChange, profile }: Props) {
  const [loading, setLoading] = useState(false);
  const [leads, setLeads] = useState<ScoredLead[]>([]);
  const [minScore, setMinScore] = useState(50);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || !profile) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Not authenticated");
        const { data, error } = await supabase
          .from("leads")
          .select("id, company_name, contact_name, job_title, industry, employee_count, company_size, technologies, department, seniority")
          .eq("user_id", user.id)
          .limit(2000);
        if (error) throw error;
        const scored = (data || []).map((l) => scoreLead(l, profile));
        scored.sort((a, b) => b.score - a.score);
        if (!cancelled) setLeads(scored);
      } catch (e: any) {
        toast.error(e.message || "Failed to find lookalikes");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, profile?.id]);

  const filtered = useMemo(() => leads.filter((l) => l.score >= minScore), [leads, minScore]);
  const stats = useMemo(() => ({
    total: leads.length,
    excellent: leads.filter((l) => l.score >= 75).length,
    good: leads.filter((l) => l.score >= 50 && l.score < 75).length,
    weak: leads.filter((l) => l.score < 50).length,
  }), [leads]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Find Lookalikes — {profile?.name}
          </DialogTitle>
          <DialogDescription>
            Leads in your database scored against this ICP across firmographics, persona, and exclusions.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
          </div>
        ) : leads.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Target className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-medium">No leads in your database yet</p>
            <p className="text-xs mt-1">Import or discover leads first, then come back to find ICP lookalikes.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 gap-2 py-2 border-y">
              <Stat label="Scanned" value={stats.total} />
              <Stat label="Excellent (75+)" value={stats.excellent} tone="green" />
              <Stat label="Good (50–74)" value={stats.good} tone="yellow" />
              <Stat label="Below threshold" value={stats.weak} tone="muted" />
            </div>
            <div className="flex items-center gap-2 py-2 flex-wrap">
              <span className="text-xs text-muted-foreground">Min score:</span>
              {[0, 25, 50, 75].map((v) => (
                <Button
                  key={v}
                  variant={minScore === v ? "default" : "outline"}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setMinScore(v)}
                >
                  {v}+
                </Button>
              ))}
              <span className="ml-auto text-xs text-muted-foreground">
                Showing {filtered.length} of {leads.length}
              </span>
            </div>
            <ScrollArea className="flex-1 -mx-6 px-6">
              <div className="space-y-2 pb-4">
                {filtered.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    No leads meet this threshold. Lower the minimum score or refine your ICP.
                  </div>
                ) : (
                  filtered.map((l) => (
                    <div
                      key={l.id}
                      className="flex items-start gap-3 p-3 rounded-lg border hover:border-primary/50 transition-colors cursor-pointer"
                      onClick={() => { onOpenChange(false); navigate(`/dashboard/leads?lead=${l.id}`); }}
                    >
                      <Badge className={getScoreColor(l.score) + " text-xs font-bold w-12 justify-center shrink-0"}>
                        {l.score}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{l.contact_name || "Unknown contact"}</span>
                          {l.job_title && <span className="text-xs text-muted-foreground">· {l.job_title}</span>}
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <Building2 className="w-3 h-3" />
                          {l.company_name || "Unknown company"}
                          {l.industry && <span>· {l.industry}</span>}
                          {(l.employee_count || l.company_size) && <span>· {l.employee_count || l.company_size} emp</span>}
                        </div>
                        {l.reasons.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {l.reasons.map((r) => (
                              <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded ${r.startsWith("⚠") ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-1" />
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green" | "yellow" | "muted" }) {
  const color = tone === "green" ? "text-green-500" : tone === "yellow" ? "text-yellow-500" : tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className="text-center">
      <div className={`text-lg font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
    </div>
  );
}
