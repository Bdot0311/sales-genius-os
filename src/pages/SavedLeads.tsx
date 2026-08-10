import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LeadAssignmentDialog } from "@/components/dashboard/LeadAssignmentDialog";
import { LeadDetailSheet } from "@/components/dashboard/LeadDetailSheet";
import { Search, Download, ArrowUpDown, Trash2, UserPlus, LayoutGrid, Table as TableIcon, ArrowLeft, CheckCircle, Sparkles, AlertCircle, Filter, Gauge } from "lucide-react";
import { IntentScoreBadge } from "@/components/dashboard/IntentScoreBadge";
import { LeadStageSelect, LEAD_STAGES } from "@/components/dashboard/LeadStageSelect";
import { LeadTierBadge } from "@/components/dashboard/LeadTierBadge";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Analytics } from "@/lib/analytics";

type SortField = "tier" | "created_at" | "icp_score" | "intent_score" | "company_name" | "company_size";
type SortOrder = "asc" | "desc";

interface Lead {
  id: string;
  company_name: string;
  contact_name: string;
  contact_email: string;
  contact_phone?: string;
  industry?: string;
  company_size?: string;
  source?: string;
  notes?: string;
  icp_score?: number;
  created_at: string;
  updated_at: string;
  user_id: string;
  linkedin_url?: string;
  job_title?: string;
  company_website?: string;
  enrichment_status?: string;
  enriched_at?: string;
  seniority?: string | null;
  department?: string | null;
  intent_score?: number | null;
  intent_label?: string | null;
  intent_reasons?: string[] | null;
  recommended_angle?: string | null;
  tier?: string | null;
  fit_score?: number | null;
  score_reason?: string | null;
  score_breakdown?: any;
  signal_date?: string | null;
  pipeline_stage?: string | null;
}

const getEnrichmentBadge = (lead: Lead) => {
  const isEnriched = lead.enrichment_status === 'enriched' || lead.enrichment_status === 'success' || !!lead.enriched_at;
  if (isEnriched) {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs gap-1">
        <CheckCircle className="w-3 h-3" />
        Enriched
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs gap-1 text-muted-foreground border-muted-foreground/30">
      <AlertCircle className="w-3 h-3" />
      Not Enriched
    </Badge>
  );
};

const SavedLeads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("tier");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "table">("table");
  const [enrichmentHistory, setEnrichmentHistory] = useState<any[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, succeeded: 0, failed: 0, skipped: 0 });
  const [scoring, setScoring] = useState(false);
  const [scoreProgress, setScoreProgress] = useState({ current: 0, total: 0 });
  const [filterIntentLabel, setFilterIntentLabel] = useState<string>("all");
  const [filterIndustry, setFilterIndustry] = useState<string>("all");
  const [filterCompanySize, setFilterCompanySize] = useState<string>("all");
  const [filterSeniority, setFilterSeniority] = useState<string>("all");
  const [filterStage, setFilterStage] = useState<string>("all");
  const [updatingStage, setUpdatingStage] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchLeads = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Hard cap at 1000 to avoid Supabase's implicit limit silently truncating large lists.
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .range(0, 999);

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading leads",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeads();

    // Labels advance automatically when outreach happens (sent / replied), so
    // keep the list in sync live instead of waiting for a manual refresh.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      channel = supabase
        .channel(`saved-leads-stage-${session.user.id}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "leads", filter: `user_id=eq.${session.user.id}` },
          (payload: any) => {
            const n = payload.new || {};
            if (!n.id) return;
            setLeads((prev) =>
              prev.map((l) =>
                l.id === n.id && (l.pipeline_stage || "new") !== (n.pipeline_stage || "new")
                  ? { ...l, pipeline_stage: n.pipeline_stage }
                  : l
              )
            );
          }
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);


  const fetchEnrichmentHistory = async (leadId: string) => {
    try {
      const { data, error } = await supabase
        .from("enrichment_history")
        .select("*")
        .eq("lead_id", leadId)
        .order("enriched_at", { ascending: false });

      if (error) throw error;
      setEnrichmentHistory(data || []);
    } catch (error) {
      console.error("Error fetching enrichment history:", error);
    }
  };

  const uniqueIndustries = Array.from(new Set(leads.map((l) => l.industry).filter(Boolean))) as string[];
  const uniqueSeniorities = Array.from(new Set(leads.map((l) => l.seniority).filter(Boolean))) as string[];
  const uniqueCompanySizes = Array.from(
    new Set(leads.map((l) => l.company_size).filter(Boolean))
  ) as string[];

  const filteredAndSortedLeads = leads
    .filter((lead) => {
      const q = searchQuery.toLowerCase();
      const matchesSearch =
        lead.company_name.toLowerCase().includes(q) ||
        lead.contact_name.toLowerCase().includes(q) ||
        (lead.contact_email?.toLowerCase().includes(q) ?? false);
      if (!matchesSearch) return false;
      if (filterIntentLabel !== "all" && lead.intent_label !== filterIntentLabel) return false;
      if (filterIndustry !== "all" && lead.industry !== filterIndustry) return false;
      if (filterCompanySize !== "all" && lead.company_size !== filterCompanySize) return false;
      if (filterSeniority !== "all" && lead.seniority !== filterSeniority) return false;
      if (filterStage !== "all" && (lead.pipeline_stage || "new") !== filterStage) return false;
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case "tier": {
          // Sort by tier (A > B > C > unscored), then by intent recency, then intent score.
          const rank: Record<string, number> = { A: 3, B: 2, C: 1 };
          comparison = (rank[a.tier || ""] || 0) - (rank[b.tier || ""] || 0);
          if (comparison === 0) {
            const da = a.signal_date ? new Date(a.signal_date).getTime() : 0;
            const db = b.signal_date ? new Date(b.signal_date).getTime() : 0;
            comparison = da - db;
            if (comparison === 0) comparison = (a.intent_score || 0) - (b.intent_score || 0);
          }
          break;
        }
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "icp_score":
          comparison = (a.icp_score || 0) - (b.icp_score || 0);
          break;
        case "intent_score":
          comparison = (a.intent_score || 0) - (b.intent_score || 0);
          break;
        case "company_name":
          comparison = a.company_name.localeCompare(b.company_name);
          break;
        case "company_size": {
          const sizeOrder: Record<string, number> = {
            "1-10": 1, "11-50": 2, "51-200": 3, "201-500": 4, "501-1000": 5, "1000+": 6,
          };
          comparison = (sizeOrder[a.company_size || ""] || 0) - (sizeOrder[b.company_size || ""] || 0);
          break;
        }
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });

  const unscoredLeadIds = filteredAndSortedLeads.filter((l) => !l.tier).map((l) => l.id);

  const handleExport = (leadsToExport = filteredAndSortedLeads) => {
    const csv = [
      "Company Name,Contact Name,Email,Phone,Industry,Company Size,Source,ICP Score,Created At",
      ...leadsToExport.map(lead => 
        `"${lead.company_name}","${lead.contact_name}","${lead.contact_email || ""}","${lead.contact_phone || ""}","${lead.industry || ""}","${lead.company_size || ""}","${lead.source || ""}","${lead.icp_score || ""}","${new Date(lead.created_at).toLocaleDateString()}"`
      )
    ].join("\n");
    
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    
    toast({
      title: "Export successful",
      description: `Exported ${leadsToExport.length} leads`,
    });
  };

  const toggleSelectAll = () => {
    if (selectedLeads.size === filteredAndSortedLeads.length) {
      setSelectedLeads(new Set());
    } else {
      setSelectedLeads(new Set(filteredAndSortedLeads.map(l => l.id)));
    }
  };

  const toggleSelectLead = (leadId: string) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(leadId)) {
      newSelected.delete(leadId);
    } else {
      newSelected.add(leadId);
    }
    setSelectedLeads(newSelected);
  };

  const handleBulkDelete = async () => {
    try {
      const ids = Array.from(selectedLeads);
      const batchSize = 50;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const { error } = await supabase
          .from("leads")
          .delete()
          .in("id", batch);
        if (error) throw error;
      }

      toast({
        title: "Leads deleted",
        description: `Deleted ${selectedLeads.size} leads`,
      });
      
      setSelectedLeads(new Set());
      setShowDeleteDialog(false);
      fetchLeads();
    } catch (error: any) {
      toast({
        title: "Error deleting leads",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleBulkExport = () => {
    const selectedLeadObjects = filteredAndSortedLeads.filter(l => selectedLeads.has(l.id));
    handleExport(selectedLeadObjects);
  };

  const handleLeadClick = async (lead: Lead) => {
    setSelectedLead(lead);
    Analytics.firstLeadViewed(lead.id);
    await fetchEnrichmentHistory(lead.id);
  };

  const handleEnrichLead = async () => {
    if (!selectedLead) return;
    setIsEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-lead', {
        body: { leadId: selectedLead.id }
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data?.alreadyUpToDate) {
        toast({
          title: "Lead already up-to-date",
          description: data.message || "No new enrichment fields were found.",
        });
      } else if (data?.noMatch) {
        toast({
          title: "No match found",
          description: data.message || "Not enough identifying data. Add an email or LinkedIn URL and try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Lead enriched",
          description: `Successfully enriched with ${data?.enrichedFields?.length || 0} new fields`,
        });
      }

      // Refresh leads and enrichment history
      await fetchLeads();
      await fetchEnrichmentHistory(selectedLead.id);

      // Update the selected lead in state with fresh data
      const { data: updatedLead } = await supabase
        .from("leads")
        .select("*")
        .eq("id", selectedLead.id)
        .single();
      if (updatedLead) setSelectedLead(updatedLead as Lead);
    } catch (error: any) {
      toast({
        title: "Enrichment failed",
        description: error.message || "Could not enrich lead",
        variant: "destructive",
      });
    } finally {
      setIsEnriching(false);
    }
  };

  const handleBulkEnrich = async () => {
    const leadIds = Array.from(selectedLeads);
    if (leadIds.length === 0) return;
    
    setBulkEnriching(true);
    setBulkProgress({ current: 0, total: leadIds.length, succeeded: 0, failed: 0, skipped: 0 });
    
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;
    
    for (let i = 0; i < leadIds.length; i++) {
      setBulkProgress(prev => ({ ...prev, current: i + 1 }));
      try {
        const { data, error } = await supabase.functions.invoke('enrich-lead', {
          body: { leadId: leadIds[i] }
        });
        if (error || data?.error) {
          failed++;
        } else if (data?.noMatch) {
          // Lead has no new data to add (already enriched or no match found)
          skipped++;
        } else {
          succeeded++;
        }
      } catch {
        failed++;
      }
    }
    
    setBulkProgress({ current: leadIds.length, total: leadIds.length, succeeded, failed, skipped });
    await fetchLeads();
    
    const parts: string[] = [];
    if (succeeded) parts.push(`${succeeded} enriched`);
    if (skipped) parts.push(`${skipped} already up-to-date`);
    if (failed) parts.push(`${failed} failed`);
    toast({
      title: "Bulk enrichment complete",
      description: parts.join(" · ") + ` (of ${leadIds.length} leads)`,
      variant: failed === leadIds.length && succeeded === 0 && skipped === 0 ? "destructive" : "default",
    });
    
    setBulkEnriching(false);
    setSelectedLeads(new Set());
  };

  // Force Lead Score v2 tiering on demand. Calls score-lead-v2 per lead (the
  // same deterministic engine that runs on enrichment) and writes the A/B/C
  // tier. Used by the per-row "Score" button and the bulk score actions.
  const handleScoreLeads = async (leadIds: string[]) => {
    if (leadIds.length === 0) {
      toast({ title: "Nothing to score", description: "These leads are already tiered." });
      return;
    }
    setScoring(true);
    setScoreProgress({ current: 0, total: leadIds.length });
    let ok = 0;
    let failed = 0;
    let firstError = "";
    for (let i = 0; i < leadIds.length; i++) {
      setScoreProgress({ current: i + 1, total: leadIds.length });
      try {
        const { data, error } = await supabase.functions.invoke("score-lead-v2", {
          body: { leadId: leadIds[i] },
        });
        if (error) {
          // supabase-js hides the function's real message behind a generic
          // "non-2xx status" error. The raw Response is on error.context, so
          // read the real { error, error_code } body from it.
          let detail = (error as any)?.message || "request failed";
          try {
            const res = (error as any)?.context;
            const body = res && typeof res.clone === "function" ? await res.clone().json() : null;
            if (body?.error) detail = body.error;
            else if (body?.error_code) detail = body.error_code;
          } catch { /* body wasn't JSON */ }
          if (!firstError) firstError = detail;
          console.error("[score-lead-v2] failed", { leadId: leadIds[i], detail, error });
          failed++;
        } else if (data?.error) {
          if (!firstError) firstError = String(data.error);
          console.error("[score-lead-v2] returned error", data.error);
          failed++;
        } else {
          ok++;
        }
      } catch (e: any) {
        if (!firstError) firstError = e?.message || "unexpected error";
        console.error("[score-lead-v2] threw", e);
        failed++;
      }
    }
    await fetchLeads();
    setScoring(false);
    setSelectedLeads(new Set());
    if (ok === 0 && failed > 0) {
      toast({
        title: "Scoring failed",
        description: firstError || "Could not score these leads. Check the console for details.",
        variant: "destructive",
      });
    } else {
      toast({
        title: "Scoring complete",
        description: `${ok} lead${ok === 1 ? "" : "s"} tiered${failed ? ` · ${failed} failed (${firstError})` : ""}.`,
        variant: failed ? "destructive" : "default",
      });
    }
  };

  const handleStageChange = async (leadId: string, stage: string) => {
    const previous = leads.find((l) => l.id === leadId)?.pipeline_stage || "new";
    setUpdatingStage(leadId);
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: stage } : l)));
    const { error } = await supabase
      .from("leads")
      .update({ pipeline_stage: stage } as any)
      .eq("id", leadId);
    setUpdatingStage(null);
    if (error) {
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, pipeline_stage: previous } : l)));
      toast({ title: "Could not update label", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Label updated",
      description: LEAD_STAGES.find((s) => s.value === stage)?.label ?? stage,
    });
  };

  const getScoreBadge = (score?: number | null) => {
    if (!score) return null;
    let color = "bg-muted text-muted-foreground";
    if (score >= 80) color = "bg-green-500/20 text-green-400";
    else if (score >= 60) color = "bg-yellow-500/20 text-yellow-400";
    else if (score >= 40) color = "bg-orange-500/20 text-orange-400";
    else color = "bg-red-500/20 text-red-400";
    return <Badge className={`${color} text-xs`}>{score}% ICP</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard/leads')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Saved Leads</h1>
              <p className="text-muted-foreground">Your enriched leads ready for outreach</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Leads ({filteredAndSortedLeads.length})</CardTitle>
            <CardDescription>All leads are pre-enriched with company and contact data</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
                
              <Select value={sortField} onValueChange={(value) => setSortField(value as SortField)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="tier">Tier</SelectItem>
                  <SelectItem value="created_at">Date Added</SelectItem>
                  <SelectItem value="icp_score">ICP Score</SelectItem>
                  <SelectItem value="intent_score">Intent Score</SelectItem>
                  <SelectItem value="company_name">Company Name</SelectItem>
                  <SelectItem value="company_size">Company Size</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterIntentLabel} onValueChange={setFilterIntentLabel}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Intent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Intent</SelectItem>
                  <SelectItem value="Very Hot">Very Hot</SelectItem>
                  <SelectItem value="Hot">Hot</SelectItem>
                  <SelectItem value="Warm">Warm</SelectItem>
                  <SelectItem value="Cold">Cold</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterStage} onValueChange={setFilterStage}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
                  <SelectValue placeholder="Label" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Labels</SelectItem>
                  {LEAD_STAGES.map((stage) => (
                    <SelectItem key={stage.value} value={stage.value}>{stage.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {uniqueIndustries.length > 0 && (
                <Select value={filterIndustry} onValueChange={setFilterIndustry}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Industry" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Industries</SelectItem>
                    {uniqueIndustries.map((ind) => (
                      <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {uniqueCompanySizes.length > 0 && (
                <Select value={filterCompanySize} onValueChange={setFilterCompanySize}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sizes</SelectItem>
                    {uniqueCompanySizes.map((size) => (
                      <SelectItem key={size} value={size}>{size}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {uniqueSeniorities.length > 0 && (
                <Select value={filterSeniority} onValueChange={setFilterSeniority}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Seniority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Seniority</SelectItem>
                    {uniqueSeniorities.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              
              <Button
                variant="outline"
                size="icon"
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              >
                <ArrowUpDown className="w-4 h-4" />
              </Button>

              {selectedLeads.size > 0 && (
                <>
                  <Button 
                    variant="hero" 
                    onClick={handleBulkEnrich}
                    disabled={bulkEnriching}
                  >
                    <Sparkles className={`w-4 h-4 mr-2 ${bulkEnriching ? 'animate-spin' : ''}`} />
                    {bulkEnriching 
                      ? `Enriching ${bulkProgress.current}/${bulkProgress.total}...` 
                      : `Enrich (${selectedLeads.size})`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => handleScoreLeads(Array.from(selectedLeads))}
                    disabled={scoring}
                  >
                    <Gauge className={`w-4 h-4 mr-2 ${scoring ? "animate-spin" : ""}`} />
                    {scoring ? `Scoring ${scoreProgress.current}/${scoreProgress.total}...` : `Score (${selectedLeads.size})`}
                  </Button>
                  <Button variant="outline" onClick={() => setShowAssignDialog(true)}>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Assign ({selectedLeads.size})
                  </Button>
                  <Button variant="outline" onClick={handleBulkExport}>
                    <Download className="w-4 h-4 mr-2" />
                    Export ({selectedLeads.size})
                  </Button>
                  <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete ({selectedLeads.size})
                  </Button>
                </>
              )}
              
              {selectedLeads.size === 0 && unscoredLeadIds.length > 0 && (
                <Button
                  variant="outline"
                  onClick={() => handleScoreLeads(unscoredLeadIds)}
                  disabled={scoring}
                >
                  <Gauge className={`w-4 h-4 mr-2 ${scoring ? "animate-spin" : ""}`} />
                  {scoring ? `Scoring ${scoreProgress.current}/${scoreProgress.total}...` : `Score ${unscoredLeadIds.length} untiered`}
                </Button>
              )}

              {selectedLeads.size === 0 && (
                <Button variant="outline" onClick={() => handleExport()}>
                  <Download className="w-4 h-4 mr-2" />
                  Export All
                </Button>
              )}

              <div className="flex gap-1 border rounded-md p-1">
                <Button
                  variant={viewMode === "card" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("card")}
                >
                  <LayoutGrid className="w-4 h-4" />
                </Button>
                <Button
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => setViewMode("table")}
                >
                  <TableIcon className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {bulkEnriching && (
              <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Enriching leads... {bulkProgress.current}/{bulkProgress.total}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ✓ {bulkProgress.succeeded} enriched · ↻ {bulkProgress.skipped} up-to-date · ✗ {bulkProgress.failed} failed
                  </span>
                </div>
                <Progress value={(bulkProgress.current / bulkProgress.total) * 100} className="h-2" />
              </div>
            )}

            {scoring && scoreProgress.total > 0 && (
              <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Scoring leads... {scoreProgress.current}/{scoreProgress.total}
                  </span>
                </div>
                <Progress value={(scoreProgress.current / scoreProgress.total) * 100} className="h-2" />
              </div>
            )}

            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading leads...
              </div>
            ) : filteredAndSortedLeads.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">
                  {searchQuery 
                    ? "No leads found matching your search" 
                    : "No saved leads yet. Search for leads and enrich them to add to your list!"}
                </p>
                {!searchQuery && (
                  <Button onClick={() => navigate('/dashboard/leads')}>
                    Find New Leads
                  </Button>
                )}
              </div>
            ) : viewMode === "table" ? (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full min-w-[900px]">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left">
                        <Checkbox
                          checked={selectedLeads.size === filteredAndSortedLeads.length && filteredAndSortedLeads.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-3 text-left text-sm font-medium">Tier</th>
                      <th className="p-3 text-left text-sm font-medium">Contact</th>
                      <th className="p-3 text-left text-sm font-medium">Company</th>
                      <th className="p-3 text-left text-sm font-medium">Industry</th>
                      <th className="p-3 text-left text-sm font-medium">Label</th>
                      <th className="p-3 text-left text-sm font-medium">Status</th>
                      <th className="p-3 text-left text-sm font-medium">ICP Score</th>
                      <th className="p-3 text-left text-sm font-medium">Intent</th>
                      <th className="p-3 text-left text-sm font-medium">Source</th>
                      <th className="p-3 text-left text-sm font-medium">Added</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedLeads.map((lead) => (
                      <tr 
                        key={lead.id} 
                        className="border-t hover:bg-muted/30 cursor-pointer"
                        onClick={() => handleLeadClick(lead)}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedLeads.has(lead.id)}
                            onCheckedChange={() => toggleSelectLead(lead.id)}
                          />
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          {lead.tier ? (
                            <LeadTierBadge lead={lead} />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleScoreLeads([lead.id])}
                              disabled={scoring}
                            >
                              <Gauge className="w-3 h-3 mr-1" />
                              Score
                            </Button>
                          )}
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{lead.contact_name}</p>
                            <p className="text-xs text-muted-foreground">{lead.contact_email}</p>
                            {lead.job_title && <p className="text-xs text-muted-foreground">{lead.job_title}</p>}
                          </div>
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{lead.company_name}</p>
                            {lead.company_size && <p className="text-xs text-muted-foreground">{lead.company_size} employees</p>}
                          </div>
                        </td>
                        <td className="p-3">
                          {lead.industry && <Badge variant="outline">{lead.industry}</Badge>}
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <LeadStageSelect
                            value={lead.pipeline_stage}
                            onChange={(stage) => handleStageChange(lead.id, stage)}
                            disabled={updatingStage === lead.id}
                          />
                        </td>
                        <td className="p-3">
                          {getEnrichmentBadge(lead)}
                        </td>
                        <td className="p-3">
                          {getScoreBadge(lead.icp_score)}
                        </td>
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <IntentScoreBadge lead={lead} />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-green-500" />
                            <span className="text-sm text-muted-foreground">{lead.source || 'Manual'}</span>
                          </div>
                        </td>
                        <td className="p-3 text-sm text-muted-foreground">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 py-2 border-b">
                  <Checkbox
                    checked={selectedLeads.size === filteredAndSortedLeads.length && filteredAndSortedLeads.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">
                    {selectedLeads.size > 0 ? `${selectedLeads.size} selected` : "Select all"}
                  </span>
                </div>
                
                {filteredAndSortedLeads.map((lead) => (
                  <Card 
                    key={lead.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleLeadClick(lead)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedLeads.has(lead.id)}
                          onCheckedChange={() => toggleSelectLead(lead.id)}
                          className="mt-1"
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="font-semibold text-lg">{lead.contact_name}</h3>
                            <span onClick={(e) => e.stopPropagation()}>
                              {lead.tier ? (
                                <LeadTierBadge lead={lead} />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleScoreLeads([lead.id])}
                                  disabled={scoring}
                                >
                                  <Gauge className="w-3 h-3 mr-1" />
                                  Score
                                </Button>
                              )}
                            </span>
                            {getScoreBadge(lead.icp_score)}
                            <span onClick={(e) => e.stopPropagation()}>
                              <IntentScoreBadge lead={lead} />
                            </span>
                            {getEnrichmentBadge(lead)}
                            <span onClick={(e) => e.stopPropagation()}>
                              <LeadStageSelect
                                value={lead.pipeline_stage}
                                onChange={(stage) => handleStageChange(lead.id, stage)}
                                disabled={updatingStage === lead.id}
                              />
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{lead.company_name}</p>
                          {lead.job_title && (
                            <p className="text-sm text-muted-foreground">{lead.job_title}</p>
                          )}
                          <div className="flex gap-4 text-sm text-muted-foreground">
                            <span>{lead.contact_email}</span>
                            {lead.contact_phone && <span>{lead.contact_phone}</span>}
                          </div>
                          <div className="flex gap-2 flex-wrap mt-1">
                            {lead.industry && (
                              <Badge variant="outline">{lead.industry}</Badge>
                            )}
                            {lead.source && (
                              <Badge variant="secondary">{lead.source}</Badge>
                            )}
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {new Date(lead.created_at).toLocaleDateString()}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedLeads.size} leads?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected leads from your database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LeadAssignmentDialog
        open={showAssignDialog}
        onOpenChange={setShowAssignDialog}
        selectedLeads={Array.from(selectedLeads)}
      />

      <LeadDetailSheet
        lead={selectedLead as any}
        open={!!selectedLead}
        onOpenChange={(open) => !open && setSelectedLead(null)}
        enrichmentHistory={enrichmentHistory}
        onEnrich={handleEnrichLead}
        isEnriching={isEnriching}
        onSave={async (leadId, updates) => {
          const { error } = await supabase
            .from("leads")
            .update(updates as any)
            .eq("id", leadId);
          if (error) {
            toast({ title: "Error saving lead", description: error.message, variant: "destructive" });
            throw error;
          }
          toast({ title: "Lead updated", description: "Your changes have been saved." });
          await fetchLeads();
          const { data: updatedLead } = await supabase.from("leads").select("*").eq("id", leadId).single();
          if (updatedLead) setSelectedLead(updatedLead as Lead);
        }}
      />
    </DashboardLayout>
  );
};

export default SavedLeads;
