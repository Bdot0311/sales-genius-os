import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LeadAssignmentDialog } from "@/components/dashboard/LeadAssignmentDialog";
import { LeadDetailSheet } from "@/components/dashboard/LeadDetailSheet";
import {
  EMPTY_FILTERS,
  activeFilterCount,
  hasActiveFilters,
  useLeadFacets,
  useSavedLeads,
  type SavedLeadFilters,
} from "@/hooks/use-saved-leads";
import {
  EnrichmentGap,
  FitBar,
  IntentScore,
  NextStep,
  PriorityMark,
  TierMark,
} from "@/components/leads/LeadSignals";
import { useLeadIntelligence } from "@/hooks/use-lead-intelligence";
import { Search, Download, ArrowUpDown, Trash2, UserPlus, LayoutGrid, Table as TableIcon, Sparkles, Filter, Gauge, Brain } from "lucide-react";
import { LeadStageSelect, LEAD_STAGES } from "@/components/dashboard/LeadStageSelect";
import { Progress } from "@/components/ui/progress";
import { useState, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
  /** 'mobile' | 'office', or null/absent when the provider did not say which. */
  contact_phone_type?: string | null;
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
  last_contacted_at?: string | null;
}

/**
 * Filters this page can be opened with.
 *
 * The overview counts leads with no email address and reachable leads nobody
 * has contacted, and offered to open them. It opened the lead search instead —
 * a page about finding new leads, which is not where the ones it had just
 * counted are. A count you cannot click through to the rows it counted is
 * trivia with a number on it.
 */
const URL_FILTERS = {
  "no-email": {
    label: "leads with no email address",
    match: (l: Lead) => !l.contact_email,
  },
  "never-contacted": {
    label: "reachable leads never contacted",
    match: (l: Lead) => Boolean(l.contact_email) && !l.last_contacted_at,
  },
} as const;

type UrlFilterKey = keyof typeof URL_FILTERS;


const SavedLeads = () => {
  const [page, setPage] = useState(0);
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
  /*
   * One object, because it is one query now.
   *
   * Seven separate useStates were seven separate reasons to refetch, and the
   * filtering happened in the browser over whatever had loaded. The database
   * does it, so the filters travel together.
   */
  const [filters, setFilters] = useState<SavedLeadFilters>(EMPTY_FILTERS);
  const setFilter = (key: keyof SavedLeadFilters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    // Any change to what is being asked for starts at the beginning. Staying
    // on page 4 of a narrower result set shows an empty page that reads as
    // "no matches".
    setPage(0);
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const showParam = searchParams.get("show");
  const urlFilter: UrlFilterKey | null =
    showParam && showParam in URL_FILTERS ? (showParam as UrlFilterKey) : null;
  const [updatingStage, setUpdatingStage] = useState<string | null>(null);

  // Lead Intelligence: saved evaluations for the leads on screen, plus the
  // on-demand evaluate action. Off entirely when the feature flag is off.
  const PAGE_SIZE = 50;
  /*
   * The list, filtered and sorted by the database.
   *
   * This replaces a loop that pulled leads a thousand at a time with
   * select("*") — every column, research briefs and notes included — up to
   * twenty thousand rows into memory, then filtered them in a useMemo. Lead
   * 20,001 did not exist and nothing said so.
   */
  const {
    rows: pageLeads,
    total: totalLeads,
    loading,
    error: loadError,
    refresh: refreshLeads,
    patchRow,
    fetchAllMatching,
  } = useSavedLeads<Lead>(filters, { field: sortField, desc: sortOrder === "desc" }, page, PAGE_SIZE);
  const { facets } = useLeadFacets();

  const leadIds = useMemo(() => pageLeads.map((l) => l.id), [pageLeads]);
  const {
    decisions,
    enabled: intelligenceEnabled,
    evaluating: evaluatingLeads,
    evaluate: evaluateLeads,
  } = useLeadIntelligence(leadIds);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {

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
            // Patch in place: the row is on screen, and refetching the page
            // to learn one field would scroll the list under the user.
            patchRow(String(n.id), { pipeline_stage: n.pipeline_stage } as Partial<Lead>);
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

  /*
   * The dropdown options, asked of the whole account.
   *
   * These were built from the rows in memory, so the Industries list changed
   * depending on which page you happened to be on: a control quietly lying
   * about its own options.
   */
  const uniqueIndustries = facets.industries;
  const uniqueSeniorities = facets.seniorities;
  const uniqueCompanySizes = facets.company_sizes;

  /*
   * The rows on this page, already filtered and sorted by the database.
   *
   * What stood here was a .filter() and .sort() over everything in memory.
   * It could only ever narrow what had loaded, so "Hot" meant "hot among the
   * rows that happened to be here" and the result read as the whole account.
   *
   * URL_FILTERS stays client-side deliberately: it narrows the current page
   * for a link from the overview ("leads with no email"), and those are small
   * sets by nature. If one grows, it belongs in the function.
   */
  const filteredAndSortedLeads = urlFilter
    ? pageLeads.filter((lead) => URL_FILTERS[urlFilter].match(lead))
    : pageLeads;

  const unscoredLeadIds = filteredAndSortedLeads.filter((l) => !l.tier).map((l) => l.id);

  const [exporting, setExporting] = useState(false);

  /*
   * Export everything the filters match, not the page you can see.
   *
   * This took the array in memory, which was the whole list back when the
   * whole list was in memory. Paged server-side, the same code would export
   * fifty rows and call it "Export All" — the silent truncation this change
   * exists to remove, in the one place a user would carry it into a
   * spreadsheet and never know.
   */
  const handleExportAll = async () => {
    setExporting(true);
    try {
      handleExport(await fetchAllMatching());
    } catch (e: any) {
      toast({
        title: "Export failed",
        description: e?.message ?? "Could not read the full list.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExport = (leadsToExport: Lead[]) => {
    const csv = [
      // Phone Type is the column that makes the phone column actionable: it is
      // how you filter an export down to the numbers you can message.
      "Company Name,Contact Name,Email,Phone,Phone Type,Industry,Company Size,Source,ICP Score,Created At",
      ...leadsToExport.map(lead =>
        `"${lead.company_name}","${lead.contact_name}","${lead.contact_email || ""}","${lead.contact_phone || ""}","${lead.contact_phone_type || ""}","${lead.industry || ""}","${lead.company_size || ""}","${lead.source || ""}","${lead.icp_score || ""}","${new Date(lead.created_at).toLocaleDateString()}"`
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

  /*
   * Select all means this page.
   *
   * With the list paged, "all" could mean the fifty on screen or the ten
   * thousand behind them, and the two are very different when the next click
   * is Delete. It selects what is visible, and the label beside it says so,
   * because a checkbox that silently means ten thousand rows is a footgun
   * rather than a convenience.
   */
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
      void refreshLeads();
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
      await refreshLeads();
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
    await refreshLeads();
    
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
    await refreshLeads();
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
    const previous = pageLeads.find((l) => l.id === leadId)?.pipeline_stage || "new";
    setUpdatingStage(leadId);
    patchRow(leadId, { pipeline_stage: stage } as Partial<Lead>);
    const { error } = await supabase
      .from("leads")
      .update({ pipeline_stage: stage } as any)
      .eq("id", leadId);
    setUpdatingStage(null);
    if (error) {
      patchRow(leadId, { pipeline_stage: previous } as Partial<Lead>);
      toast({ title: "Could not update label", description: error.message, variant: "destructive" });
      return;
    }
    toast({
      title: "Label updated",
      description: LEAD_STAGES.find((s) => s.value === stage)?.label ?? stage,
    });
  };


  return (
    <DashboardLayout>
      {/* The breadcrumb is the way back. An icon-only arrow beside the title
          said the same thing without saying where to, and it was the only
          back button in the dashboard. */}
      <PageHeader
        breadcrumbs={[{ label: "Leads", href: "/dashboard/leads" }, { label: "Saved" }]}
        title="Saved Leads"
        description="Your enriched leads ready for outreach"
      />
      <div className="space-y-4 pt-4">

        {/* Say the list is filtered, and give it back.
            A page that silently shows a subset is a page the reader will read
            as their whole list and act on as if it were. */}
        {urlFilter && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/50 bg-muted/20 px-4 py-2.5">
            <p className="text-[0.6875rem] text-muted-foreground">
              Showing <span className="text-foreground">{filteredAndSortedLeads.length}</span>{" "}
              {URL_FILTERS[urlFilter].label} out of {totalLeads}.
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const next = new URLSearchParams(searchParams);
                next.delete("show");
                setSearchParams(next, { replace: true });
              }}
            >
              Show all
            </Button>
          </div>
        )}

        <Panel>
          <PanelHeader>
            <PanelTitle>
              {/* The real total, not the length of the page. This said 50 on
                  an account of ten thousand. */}
              {urlFilter || hasActiveFilters(filters) ? "Matching leads" : "All leads"} ({totalLeads})
            </PanelTitle>
            <PanelDescription>All leads are pre-enriched with company and contact data</PanelDescription>
          </PanelHeader>
          <PanelBody className="space-y-4">
            {/* The controls sit above the data and were the same visual weight
                as it, so seven dropdowns competed with the rows for attention
                every time the page was read. They stay visible, because hiding
                them behind a Filters button is worse, but they stop shouting.
                What is actually applied is the thing worth seeing. */}
            {(hasActiveFilters(filters) || urlFilter) && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">
                  {activeFilterCount(filters) + (urlFilter ? 1 : 0)} filter
                  {activeFilterCount(filters) + (urlFilter ? 1 : 0) === 1 ? "" : "s"} applied
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setFilters(EMPTY_FILTERS);
                    setPage(0);
                    if (urlFilter) setSearchParams({});
                  }}
                  className="text-primary underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              </div>
            )}
            <div className="flex gap-2 flex-wrap [&_button[role=combobox]]:h-8 [&_button[role=combobox]]:text-xs [&_button[role=combobox]]:text-muted-foreground">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads..."
                  value={filters.search}
                  onChange={(e) => setFilter("search", e.target.value)}
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

              <Select value={filters.intentLabel} onValueChange={(v) => setFilter("intentLabel", v)}>
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

              <Select value={filters.stage} onValueChange={(v) => setFilter("stage", v)}>
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

              {intelligenceEnabled && (
                <>
                  <Select value={filters.priority} onValueChange={(v) => setFilter("priority", v)}>
                    <SelectTrigger className="w-[160px]">
                      <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
                      <SelectValue placeholder="AI priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All AI priorities</SelectItem>
                      <SelectItem value="high">High priority</SelectItem>
                      <SelectItem value="medium">Medium priority</SelectItem>
                      <SelectItem value="low">Low priority</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={filters.nextStep} onValueChange={(v) => setFilter("nextStep", v)}>
                    <SelectTrigger className="w-[170px]">
                      <Filter className="w-3 h-3 mr-1 text-muted-foreground" />
                      <SelectValue placeholder="Next step" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any next step</SelectItem>
                      <SelectItem value="send_now">Ready to email</SelectItem>
                      <SelectItem value="needs_more_research">Research first</SelectItem>
                      <SelectItem value="do_not_send">Do not email</SelectItem>
                    </SelectContent>
                  </Select>
                </>
              )}

              {uniqueIndustries.length > 0 && (
                <Select value={filters.industry} onValueChange={(v) => setFilter("industry", v)}>
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
                <Select value={filters.companySize} onValueChange={(v) => setFilter("companySize", v)}>
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
                <Select value={filters.seniority} onValueChange={(v) => setFilter("seniority", v)}>
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
                  {intelligenceEnabled && (
                    <Button
                      variant="outline"
                      onClick={() => evaluateLeads(Array.from(selectedLeads).slice(0, 10), { force: true })}
                      disabled={evaluatingLeads.size > 0}
                    >
                      <Brain className={`w-4 h-4 mr-2 ${evaluatingLeads.size > 0 ? "animate-pulse" : ""}`} />
                      {evaluatingLeads.size > 0
                        ? "Evaluating..."
                        : `Evaluate (${Math.min(selectedLeads.size, 10)})`}
                    </Button>
                  )}
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
                <Button variant="outline" onClick={() => void handleExportAll()} disabled={exporting}>
                  <Download className="w-4 h-4 mr-2" />
                  {/* It says All and it means all: the export pages the query
                      rather than writing out the rows on screen. */}
                  {exporting ? "Exporting…" : hasActiveFilters(filters) ? `Export ${totalLeads}` : "Export All"}
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

            {loadError ? (
              /* An error that says what happened and offers the one action
                 that helps. "Loading leads..." forever was the old answer. */
              <div className="py-12 text-center">
                <p className="mb-1 text-sm text-foreground">Could not load your leads.</p>
                <p className="mb-4 font-mono text-xs text-muted-foreground">{loadError}</p>
                <Button variant="outline" size="sm" onClick={() => void refreshLeads()}>
                  Try again
                </Button>
              </div>
            ) : loading ? (
              /* Skeleton rows at the real row height, so the page does not
                 jump when they are replaced. A spinner in the middle of
                 content tells you nothing about what is arriving. */
              <div className="space-y-px" aria-busy="true" aria-label="Loading leads">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 border-t border-border/40 px-3 py-2">
                    <div className="h-3.5 w-3.5 shrink-0 rounded-sm bg-foreground/[0.06]" />
                    <div className="h-3 w-4 shrink-0 rounded bg-foreground/[0.06]" />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="h-3 w-40 rounded bg-foreground/[0.06]" />
                      <div className="h-2.5 w-56 rounded bg-foreground/[0.04]" />
                    </div>
                    <div className="h-1 w-12 shrink-0 rounded-full bg-foreground/[0.06]" />
                    <div className="h-3 w-8 shrink-0 rounded bg-foreground/[0.06]" />
                  </div>
                ))}
              </div>
            ) : filteredAndSortedLeads.length === 0 ? (
              /* Two different nothings.
                 "No leads" and "none match these filters" looked identical,
                 which turned a filter mistake into "the product lost my
                 leads". The second one offers the way back. */
              hasActiveFilters(filters) || urlFilter ? (
                <div className="py-12 text-center">
                  <p className="mb-1 text-sm text-foreground">No leads match these filters.</p>
                  <p className="mb-4 text-xs text-muted-foreground">
                    You have {facets.total} saved {facets.total === 1 ? "lead" : "leads"}.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setFilters(EMPTY_FILTERS);
                      setPage(0);
                      if (urlFilter) setSearchParams({});
                    }}
                  >
                    Clear filters
                  </Button>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="mb-1 text-sm text-foreground">No saved leads yet.</p>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Leads you find and save land here, enriched and scored.
                  </p>
                  <Button onClick={() => navigate("/dashboard/leads")}>Find leads</Button>
                </div>
              )
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
                      {/* Headers are quieter than the data under them. They are
                          read once; the rows are read every time. */}
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Tier</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Contact</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Company</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Industry</th>
                      {/* "Label" said nothing about what it held. It is the
                          pipeline stage, so it says so. */}
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Stage</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Fit</th>
                      {/* Numbers align right so a column of them compares
                          vertically without being read one at a time. */}
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Intent</th>
                      {intelligenceEnabled && (
                        <>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Priority</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Next step</th>
                        </>
                      )}
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Source</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-muted-foreground">Added</th>
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
                        {/* Tier: a grade, so a letterform. It leads the row
                            like a rank rather than sitting in a chip. */}
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          {lead.tier ? (
                            <TierMark tier={lead.tier} />
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => handleScoreLeads([lead.id])}
                              disabled={scoring}
                            >
                              <Gauge className="w-3 h-3 mr-1" />
                              Score
                            </Button>
                          )}
                        </td>
                        {/* Identity is the anchor: strongest weight on the
                            page, because everything else is an attribute of
                            this person. Enrichment appears only when it is
                            missing, which is the only time it says anything. */}
                        <td className="px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">{lead.contact_name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {lead.contact_email || <span className="text-muted-foreground/40">no email</span>}
                            </p>
                            <div className="flex items-center gap-1.5">
                              {lead.job_title && (
                                <span className="truncate text-xs text-muted-foreground/70">{lead.job_title}</span>
                              )}
                              <EnrichmentGap status={lead.enrichment_status} />
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm text-foreground/90">{lead.company_name}</p>
                            {lead.company_size && (
                              <p className="truncate text-xs text-muted-foreground/70">{lead.company_size}</p>
                            )}
                          </div>
                        </td>
                        {/* Industry is a category, not a status. A badge told
                            the eye it was one more thing to decode. */}
                        <td className="px-3 py-2">
                          <span className="line-clamp-1 text-xs text-muted-foreground" title={lead.industry ?? undefined}>
                            {lead.industry || <span className="text-muted-foreground/30">&ndash;</span>}
                          </span>
                        </td>
                        <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                          <LeadStageSelect
                            value={lead.pipeline_stage}
                            onChange={(stage) => handleStageChange(lead.id, stage)}
                            disabled={updatingStage === lead.id}
                          />
                        </td>
                        {/* Fit: a proportion, so a bar. Aligned in a column it
                            answers "how does this one compare" without reading
                            a single number. */}
                        <td className="px-3 py-2">
                          <FitBar score={lead.icp_score} />
                        </td>
                        {/* Intent: a score, so figures, right-aligned and
                            tabular. The heat word only above the threshold,
                            where it earns its space. */}
                        <td className="px-3 py-2 text-right">
                          <IntentScore score={lead.intent_score} label={lead.intent_label} />
                        </td>
                        {intelligenceEnabled && (
                          <>
                            {/* Priority: an ordinal, so a level. Height reads
                                faster than a word and does not widen the row by
                                the length of the longest label. */}
                            <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                              <PriorityMark priority={decisions[lead.id]?.fields.email_priority?.value} />
                            </td>
                            {/* Next step: a recommendation, so a sentence.
                                It was filterable but never shown. */}
                            <td className="px-3 py-2 max-w-[10rem]">
                              <NextStep step={decisions[lead.id]?.fields.send_recommendation?.value} />
                            </td>
                          </>
                        )}
                        {/* The green tick appeared on every row, so it marked
                            nothing. The source is the information. */}
                        <td className="px-3 py-2">
                          <span className="text-xs text-muted-foreground">{lead.source || "Manual"}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-muted-foreground/70">
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
                    {/* Names the number, because "all" is ambiguous once the
                        list is paged and the next click might be Delete. */}
                    {selectedLeads.size > 0
                      ? `${selectedLeads.size} selected`
                      : totalLeads > filteredAndSortedLeads.length
                        ? `Select these ${filteredAndSortedLeads.length}`
                        : "Select all"}
                  </span>
                </div>
                
                {filteredAndSortedLeads.map((lead) => (
                  <Panel 
                    key={lead.id} 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => handleLeadClick(lead)}
                  >
                    <PanelBody className="p-4">
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
                            {/* Same five encodings as the table. The card view
                                had its own badge vocabulary, so switching
                                between the two meant relearning the page. */}
                            <span onClick={(e) => e.stopPropagation()}>
                              {lead.tier ? (
                                <TierMark tier={lead.tier} />
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-1.5 text-xs text-muted-foreground hover:text-foreground"
                                  onClick={() => handleScoreLeads([lead.id])}
                                  disabled={scoring}
                                >
                                  <Gauge className="w-3 h-3 mr-1" />
                                  Score
                                </Button>
                              )}
                            </span>
                            <FitBar score={lead.icp_score} />
                            <span onClick={(e) => e.stopPropagation()}>
                              <IntentScore score={lead.intent_score} label={lead.intent_label} />
                            </span>
                            {intelligenceEnabled && (
                              <span onClick={(e) => e.stopPropagation()}>
                                <PriorityMark priority={decisions[lead.id]?.fields.email_priority?.value} />
                              </span>
                            )}
                            <EnrichmentGap status={lead.enrichment_status} />
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
                            {lead.contact_phone && (
                              <span className="flex items-center gap-1.5">
                                {lead.contact_phone}
                                {/* Mobile is the number worth having: better
                                    reach rate, and the only kind WhatsApp can
                                    be on. Silent when the line type is unknown. */}
                                {lead.contact_phone_type === 'mobile' && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Mobile</Badge>
                                )}
                                {lead.contact_phone_type === 'office' && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">Office</Badge>
                                )}
                              </span>
                            )}
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
                    </PanelBody>
                  </Panel>
                ))}
              </div>
            )}

            {/* Paging, because there are now more rows than a page.
                The list used to hold everything it had loaded, so there was
                nothing to page: it just stopped at twenty thousand and said
                nothing. The range and the total are both spelled out, so the
                end of the list is a fact rather than something you infer from
                a button going grey. */}
            {!loading && !loadError && totalLeads > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3 border-t border-border/50 px-1 pt-3 text-xs text-muted-foreground">
                <span className="font-mono tabular-nums">
                  {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, totalLeads)} of {totalLeads}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={page === 0}
                    onClick={() => setPage((n) => Math.max(0, n - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2"
                    disabled={(page + 1) * PAGE_SIZE >= totalLeads}
                    onClick={() => setPage((n) => n + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </PanelBody>
        </Panel>
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
        showIntelligence={intelligenceEnabled}
        decision={selectedLead ? decisions[selectedLead.id] : undefined}
        isEvaluating={selectedLead ? evaluatingLeads.has(selectedLead.id) : false}
        onEvaluate={selectedLead ? () => evaluateLeads([selectedLead.id], { force: true }) : undefined}
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
          await refreshLeads();
          const { data: updatedLead } = await supabase.from("leads").select("*").eq("id", leadId).single();
          if (updatedLead) setSelectedLead(updatedLead as Lead);
        }}
      />
    </DashboardLayout>
  );
};

export default SavedLeads;
