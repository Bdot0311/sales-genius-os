import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel, PanelBody, PanelHeader } from "@/components/dashboard/Panel";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { ImportLeadsDialog } from "@/components/dashboard/ImportLeadsDialog";
import { ExternalLeadsTable } from "@/components/dashboard/ExternalLeadsTable";
import { SearchingResults } from "@/components/dashboard/SearchingResults";
import { AILeadCommand } from "@/components/dashboard/AILeadCommand";
import { DomainICPBuilder } from "@/components/dashboard/DomainICPBuilder";
import { TargetCompanies } from "@/components/dashboard/TargetCompanies";
import { FindPerson } from "@/components/dashboard/FindPerson";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildExternalFilters, ParsedIcpFilters } from "@/lib/lead-filters";
import { Users, RefreshCw, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { PLAN_CONFIG } from "@/lib/stripe-config";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExternalLeads, ExternalLeadFilters } from "@/hooks/use-external-leads";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { useRealtimeTable } from "@/hooks/use-realtime-table";
import { Analytics } from "@/lib/analytics";
import { PLAN_SEARCH_LIMITS } from "../../supabase/functions/_shared/plan-limits.ts";


/**
 * One word each. Four multi-word labels do not fit across a 390px screen, and
 * the previous fix — scrolling them — sliced the first and last label in half,
 * which reads as a broken control rather than a scrollable one. Each mode
 * introduces itself in a line of text inside the panel instead.
 */
const SEARCH_MODES = [
  { value: "describe", label: "Describe" },
  { value: "website", label: "Website" },
  { value: "companies", label: "Companies" },
  { value: "person", label: "Person" },
] as const;

/** What the search does, stated on the page that does it. */
const SEARCH_PRIMER = [
  {
    step: "01",
    title: "Describe who you want",
    body: "Role, industry and location in one sentence. No filter builder, no boolean syntax.",
  },
  {
    step: "02",
    title: "Read what came back",
    body: "Name, title, company and a verified email. Addresses that failed verification are removed before you see them.",
  },
  {
    step: "03",
    title: "Save the ones worth it",
    body: "Saved leads are what sequences send to and what the agent researches. The rest you never think about again.",
  },
] as const;

const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [externalFilters, setExternalFilters] = useState<ExternalLeadFilters>({});
  const [showExternalLeads, setShowExternalLeads] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const [inputTab, setInputTab] = useState("describe");
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { status: subscriptionStatus, loading: subscriptionLoading } = useSubscriptionStatus();
  const { credits, canSearch, useCredit, loading: creditsLoading } = useSearchCredits();
  
  const {
    leads: externalLeads,
    loading: externalLoading,
    activatingLead: externalActivating,
    pagination,
    disclosure,
    removedUndeliverable,
    fetchLeads: fetchExternalLeads,
    activateLead: activateExternalLead,
    clearLeads: clearExternalLeads,
    goToPage,
  } = useExternalLeads();

  // Everyone can search — free users get 100 leads before hitting the upsell.
  // Out-of-credits state is handled by the upsell card below.
  const canAccessLeadGen = true;
  const isOutOfFreeLeads =
    !subscriptionLoading &&
    subscriptionStatus?.isPaidUser !== true &&
    credits != null &&
    (credits.remainingCredits ?? 0) <= 0;



  const fetchLeads = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("leads")
        .select("id")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setLeads(data || []);
    } catch (error: any) {
      console.error("Error loading leads:", error);
    }
  };

  useEffect(() => {
    fetchLeads();
  }, []);

  useRealtimeTable({
    channel: "leads-page",
    table: "leads",
    onChange: () => fetchLeads(),
  });

  // Run a search from a confirmed ICP produced by the "Analyze your website" tab.
  // Reuses the exact same pipeline as the describe flow (buildExternalFilters →
  // fetchExternalLeads), so results, cards, and metering are identical.
  const handleDomainFindLeads = (aiFilters: ParsedIcpFilters, label: string) => {
    if (!canSearch) {
      const isFreeExhausted = !subscriptionStatus?.isPaidUser && (credits?.remainingCredits ?? 0) <= 0;
      toast({
        title: isFreeExhausted ? "Free leads used up" : "Search limit reached",
        description: isFreeExhausted
          ? `You've used your ${PLAN_SEARCH_LIMITS.free.monthlySearchCredits} free lead searches. Upgrade to keep finding prospects.`
          : "You've reached your search limit. Try again later.",
        variant: "destructive",
      });
      return;
    }
    setAiSearchQuery(label);
    setShowExternalLeads(true);
    const newFilters = buildExternalFilters(aiFilters, pageSize);
    setExternalFilters(newFilters);
    fetchExternalLeads(newFilters);
    Analytics.firstSearchRun();
  };

  // Run a search scoped to a chosen set of target companies ("Target companies" tab).
  // Same pipeline, results, cards, and single-credit metering as every other flow.
  const handleCompaniesFindLeads = (
    filters: Pick<ExternalLeadFilters, "companies" | "job_title">,
    label: string,
  ) => {
    if (!canSearch) {
      const isFreeExhausted = !subscriptionStatus?.isPaidUser && (credits?.remainingCredits ?? 0) <= 0;
      toast({
        title: isFreeExhausted ? "Free leads used up" : "Search limit reached",
        description: isFreeExhausted
          ? `You've used your ${PLAN_SEARCH_LIMITS.free.monthlySearchCredits} free lead searches. Upgrade to keep finding prospects.`
          : "You've reached your search limit. Try again later.",
        variant: "destructive",
      });
      return;
    }
    setAiSearchQuery(label);
    setShowExternalLeads(true);
    const newFilters: ExternalLeadFilters = { ...filters, limit: pageSize };
    setExternalFilters(newFilters);
    fetchExternalLeads(newFilters);
    Analytics.firstSearchRun();
  };

  // Sourcing a committee gap (from the Accounts page) reuses this exact flow.
  // Wait until credits/subscription have loaded, otherwise canSearch is still
  // false on the first tick and the search would be blocked with a false
  // "limit reached" toast.
  const sourceHandledRef = useRef(false);
  useEffect(() => {
    const st = location.state as any;
    if (!st?.sourceCompany?.name || sourceHandledRef.current) return;
    if (creditsLoading || subscriptionLoading) return;
    sourceHandledRef.current = true;
    setInputTab("companies");
    handleCompaniesFindLeads(
      {
        companies: [{ name: st.sourceCompany.name, domain: st.sourceCompany.domain }],
        // Prefer a real job-title query; persona labels ("economic buyer") match
        // almost nothing upstream.
        job_title: st.sourceTitle || undefined,
      },
      st.sourceCompany.name,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creditsLoading, subscriptionLoading, location.state]);

  return (
    <DashboardLayout>
      <PageHeader
        title="Leads"
        description="Manage and qualify your prospects"
        actions={
          /* All three are quiet on purpose. The page has exactly one primary
             action and it is the search below; when the header carried a filled
             button and a gradient button, the two loudest things on the screen
             were the two things you are least likely to want. */
          <>
            <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/leads/saved')}>
              <Users className="w-4 h-4 mr-2" />
              Saved
              {leads.length > 0 && <Badge variant="secondary" className="ml-2">{leads.length}</Badge>}
            </Button>
            <ImportLeadsDialog onImportComplete={fetchLeads} triggerVariant="outline" />
            <AddLeadDialog onLeadAdded={fetchLeads} triggerVariant="outline" />
          </>
        }
      />
      <div className="px-6 py-5 space-y-4 max-w-[1400px] mx-auto">

        {/* Free-leads exhausted upsell — shown only after the 100 free leads are used */}
        {isOutOfFreeLeads && (
          <EmptyState
            title={`You've used your ${PLAN_SEARCH_LIMITS.free.monthlySearchCredits} free lead searches`}
            body="A paid plan unlocks thousands of monthly searches and verified contact data. From $39/mo, cancel anytime."
            action={
              <Button size="sm" onClick={() => navigate('/pricing')} className="gap-2">
                <CreditCard className="h-3.5 w-3.5" />
                See plans
              </Button>
            }
          />
        )}


        {/* AI Command Interface - Hero Section (only show for paid users) */}
        {canAccessLeadGen && (
          <>
            {/* One panel, four ways in.
                The four modes used to be pill tabs above four separate cards,
                each of which repeated the tab's own label as its heading. That
                is three borders and two titles for one control. Here the tab
                strip is the panel's own header, so the panel is the instrument
                and the mode is a setting on it.

                The labels are one word each because four multi-word labels do
                not fit across a 390px screen. Scrolling them was the previous
                attempt and it read as broken: the strip sliced the first and
                last label in half. Short labels need no scrolling at all, and
                each mode explains itself in a line inside the panel. */}
            <Tabs value={inputTab} onValueChange={setInputTab} className="w-full">
              <div className="overflow-hidden rounded-xl border border-border/50 bg-card shadow-[0_18px_44px_-30px_hsl(0_0%_0%/0.9)]">
                <TabsList className="flex h-auto w-full justify-start gap-0 overflow-visible overflow-x-visible rounded-none border-b border-border/50 bg-muted/20 p-0 sm:h-auto">
                  {SEARCH_MODES.map((mode) => (
                    <TabsTrigger
                      key={mode.value}
                      value={mode.value}
                      className="relative flex-1 rounded-none px-1 py-2.5 text-xs font-medium text-muted-foreground transition-colors after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-transparent hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:bg-primary sm:px-5 sm:text-sm"
                    >
                      {mode.label}
                    </TabsTrigger>
                  ))}
                </TabsList>

                <div className="p-4 sm:p-5">

              <TabsContent value="describe" className="mt-0">
            <AILeadCommand
              onSearch={async (query) => {
                // Check if user can search
                if (!canSearch) {
                  const isFreeExhausted = !subscriptionStatus?.isPaidUser && (credits?.remainingCredits ?? 0) <= 0;
                  toast({
                    title: isFreeExhausted ? "Free leads used up" : "Search limit reached",
                    description: isFreeExhausted
                      ? `You've used your ${PLAN_SEARCH_LIMITS.free.monthlySearchCredits} free lead searches. Upgrade to keep finding prospects.`
                      : "You've reached your daily search limit. Try again tomorrow.",
                    variant: "destructive",
                  });
                  return;
                }

                // NOTE: Credit deduction is handled server-side by the
                // fetch-external-leads edge function. We only do the
                // client-side canSearch gate above so the UI can short-circuit
                // before kicking off an external call. Deducting here would
                // double-charge the user.

                setAiSearchQuery(query);
                setShowExternalLeads(true);
                
                try {
                  const { data, error } = await supabase.functions.invoke('parse-lead-query', {
                    body: { query }
                  });
                  
                  if (error) throw error;
                  
                  const aiFilters = (data?.filters || {}) as ParsedIcpFilters;
                  // Keep the original sentence. The provider's semantic parser
                  // can understand product/use-case qualifiers; flattening every
                  // phrase into one comma-separated keyword filter made all of
                  // them mandatory and turned valid niche searches into zero.
                  const newFilters = buildExternalFilters(aiFilters, pageSize, query);

                  setExternalFilters(newFilters);
                  fetchExternalLeads(newFilters);
                  Analytics.firstSearchRun();
                } catch (error) {
                  console.error('AI parsing failed, using fallback:', error);
                  const lowerQuery = query.toLowerCase();
                  // Always forward the raw sentence to the provider's semantic
                  // parser. Without this, if parse-lead-query fails and the regex
                  // below extracts no title/industry, the search goes out with no
                  // parameters and the backend rejects it ("could not tell what to
                  // search for") — so every fallback search failed. The regex
                  // fields below still layer on as structured hints when present.
                  const newFilters: ExternalLeadFilters = { limit: pageSize, query };

                  // Job title extraction — order matters, check longer titles first
                  const titlePatterns: [RegExp, string][] = [
                    [/chief\s+executive|ceo/i, 'CEO'],
                    [/chief\s+technology|cto/i, 'CTO'],
                    [/chief\s+financial|cfo/i, 'CFO'],
                    [/chief\s+marketing|cmo/i, 'CMO'],
                    [/chief\s+revenue|cro/i, 'Chief Revenue Officer'],
                    [/chief\s+product|cpo/i, 'Chief Product Officer'],
                    [/chief\s+operating|coo/i, 'COO'],
                    [/co-?founder|cofounder/i, 'Co-Founder'],
                    [/founder/i, 'Founder'],
                    [/vp\s+of\s+sales|vice\s+president.*sales/i, 'VP of Sales'],
                    [/vp\s+of\s+marketing/i, 'VP of Marketing'],
                    [/vp\s+of\s+engineering/i, 'VP of Engineering'],
                    [/vp\b/i, 'Vice President'],
                    [/head\s+of\s+sales/i, 'Head of Sales'],
                    [/head\s+of\s+growth/i, 'Head of Growth'],
                    [/head\s+of\s+marketing/i, 'Head of Marketing'],
                    [/gtm|go.to.market/i, 'Growth Manager'],
                    [/revops|revenue\s+operations/i, 'Revenue Operations Manager'],
                    [/sales\s+director|director.*sales/i, 'Sales Director'],
                    [/director/i, 'Director'],
                    [/account\s+executive|ae\b/i, 'Account Executive'],
                    [/sdr|bdr|business\s+development\s+rep/i, 'Sales Development Representative'],
                    [/sales\s+manager/i, 'Sales Manager'],
                    [/product\s+manager|pm\b/i, 'Product Manager'],
                    [/engineer|developer|dev\b/i, 'Software Engineer'],
                    [/designer/i, 'Designer'],
                    [/owner|proprietor/i, 'Owner'],
                  ];
                  for (const [pattern, title] of titlePatterns) {
                    if (pattern.test(lowerQuery)) {
                      newFilters.job_title = title;
                      break;
                    }
                  }

                  // Industry extraction
                  const industryPatterns: [RegExp, string][] = [
                    [/fintech|financial\s+tech/i, 'Financial Services'],
                    [/healthtech|health\s+tech|healthcare|medical/i, 'Healthcare'],
                    [/saas|software/i, 'Computer Software'],
                    [/ecommerce|e-commerce/i, 'Internet'],
                    [/marketing|advertising/i, 'Marketing and Advertising'],
                    [/real\s*estate/i, 'Real Estate'],
                    [/edtech|education/i, 'Education'],
                    [/legaltech|legal/i, 'Legal Services'],
                    [/crypto|blockchain|web3/i, 'Information Technology'],
                    [/consulting/i, 'Management Consulting'],
                    [/recruiting|staffing|hr\b/i, 'Staffing and Recruiting'],
                    [/manufacturing/i, 'Manufacturing'],
                    [/retail/i, 'Retail'],
                    [/tech|technology/i, 'Information Technology'],
                  ];
                  for (const [pattern, industry] of industryPatterns) {
                    if (pattern.test(lowerQuery)) {
                      newFilters.industry = industry;
                      break;
                    }
                  }

                  // Location extraction (common patterns)
                  const locationPatterns: [RegExp, string][] = [
                    [/united\s+states|usa?\b|u\.s\.a?/i, 'US'],
                    [/united\s+kingdom|uk\b|britain|england/i, 'GB'],
                    [/canada/i, 'CA'],
                    [/australia/i, 'AU'],
                    [/germany/i, 'DE'],
                    [/france/i, 'FR'],
                    [/india/i, 'IN'],
                    [/new\s+york/i, 'New York'],
                    [/california|san\s+francisco|silicon\s+valley|los\s+angeles/i, 'California'],
                    [/london/i, 'London'],
                    [/toronto/i, 'Toronto'],
                    [/chicago/i, 'Chicago'],
                    [/austin/i, 'Austin'],
                    [/boston/i, 'Boston'],
                    [/seattle/i, 'Seattle'],
                  ];
                  for (const [pattern, location] of locationPatterns) {
                    if (pattern.test(query)) {
                      newFilters.country = location;
                      break;
                    }
                  }

                  const countMatch = lowerQuery.match(/(\d+)\s*(leads?|founders?|ceos?|prospects?|people|contacts?)/i);
                  if (countMatch) {
                    newFilters.limit = Math.min(parseInt(countMatch[1]), 100);
                  }

                  setExternalFilters(newFilters);
                  fetchExternalLeads(newFilters);
                }
              }}
              isSearching={externalLoading}
            />
              </TabsContent>

              <TabsContent value="website" className="mt-0">
                <DomainICPBuilder
                  onFindLeads={handleDomainFindLeads}
                  onSwitchToDescribe={() => setInputTab("describe")}
                  isSearching={externalLoading}
                />
              </TabsContent>

              <TabsContent value="companies" className="mt-0">
                <TargetCompanies
                  onFindLeads={handleCompaniesFindLeads}
                  isSearching={externalLoading}
                />
              </TabsContent>

              <TabsContent value="person" className="mt-0">
                <FindPerson />
              </TabsContent>

                </div>

                {/* The allowance, where the spending happens. It used to live
                    only on the billing page, so the one screen that consumes
                    credits was the one screen that never mentioned them. */}
                {credits && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/40 bg-muted/15 px-4 py-2 text-[0.6875rem] text-muted-foreground sm:px-5">
                    <span>
                      <span className="font-medium tabular-nums text-foreground">
                        {credits.remainingCredits.toLocaleString()}
                      </span>{" "}
                      of {credits.totalCredits.toLocaleString()} search credits left
                    </span>
                    <div
                      className="hidden h-1 w-20 overflow-hidden rounded-full bg-foreground/10 sm:block"
                      role="presentation"
                    >
                      <div
                        className="h-full rounded-full bg-primary/80"
                        style={{
                          width: `${Math.max(0, Math.min(100, credits.totalCredits > 0 ? (credits.remainingCredits / credits.totalCredits) * 100 : 0))}%`,
                        }}
                      />
                    </div>
                    <span aria-hidden className="text-border/70">·</span>
                    <span>{PLAN_CONFIG[credits.plan]?.name ?? credits.plan} plan</span>
                    {credits.plan === "free" && (
                      <button
                        type="button"
                        onClick={() => navigate("/pricing")}
                        className="ml-auto text-primary transition-colors hover:text-primary/80"
                      >
                        Get more
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Tabs>

            {/* What the page does, on the page that does it.
                Before this there was roughly a screen and a half of empty
                background under the search, which reads as a page that has not
                loaded rather than one waiting for input. Three hairline-split
                panes on one surface, not three floating cards. */}
            {!showExternalLeads && (
              <div className="grid overflow-hidden rounded-xl border border-border/30 sm:grid-cols-3">
                {SEARCH_PRIMER.map((pane, i) => (
                  <div
                    key={pane.title}
                    className={`px-4 py-3.5 sm:px-5 sm:py-4 ${i > 0 ? "border-t border-border/30 sm:border-l sm:border-t-0" : ""}`}
                  >
                    <p className="text-[0.625rem] font-medium uppercase tracking-[0.1em] text-muted-foreground/40">
                      {pane.step}
                    </p>
                    <p className="mt-1.5 text-[0.8125rem] font-medium text-foreground/90">{pane.title}</p>
                    <p className="mt-1 text-[0.6875rem] leading-relaxed text-muted-foreground/70">{pane.body}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Results.
                Titled "AI-Discovered Leads" under a sparkle before this, which
                announced the implementation and told the reader nothing they
                could act on. The same border and radius as the search panel, so
                the two read as one instrument rather than two widgets. */}
            {showExternalLeads && (
          <Panel>
            <PanelHeader
              title="Results"
              meta={
                externalLeads.length > 0
                  ? `${externalLeads.length} ${externalLeads.length === 1 ? "contact" : "contacts"}`
                  : undefined
              }
              actions={
                /* One button. There were two, side by side, running the
                   identical three setters under different names. */
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    clearExternalLeads();
                    setShowExternalLeads(false);
                    setAiSearchQuery("");
                  }}
                >
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                  New search
                </Button>
              }
            />
            {aiSearchQuery && (
              <div className="border-b border-border/30 px-4 py-2 sm:px-5">
                <p className="truncate text-[0.6875rem] text-muted-foreground">{aiSearchQuery}</p>
              </div>
            )}
            <PanelBody>
              {externalLoading ? (
                /* The criteria the search is running with, then rows in the
                   shape the results will take so the page does not reflow when
                   they land. The command box above does not report this: it was
                   saying the same sentence at the same time, so one search
                   produced two spinners. */
                <SearchingResults filters={externalFilters} />
              ) : externalLeads.length > 0 ? (
                <div className="space-y-4">
                  {disclosure.relaxed.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                      No exact matches, so these results ignore your{" "}
                      <span className="font-medium">{disclosure.relaxed.join(" and ")}</span>{" "}
                      {disclosure.relaxed.length > 1 ? "filters" : "filter"}. They are broader than what you asked for.
                    </div>
                  )}
                  {removedUndeliverable > 0 && (
                    <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
                      Removed <span className="font-medium">{removedUndeliverable}</span>{" "}
                      {removedUndeliverable === 1 ? "contact whose email" : "contacts whose emails"}{" "}
                      failed verification. Sending to {removedUndeliverable === 1 ? "it" : "them"} would have bounced.
                    </div>
                  )}
                  <ExternalLeadsTable
                    leads={externalLeads}
                    activatingLead={externalActivating}
                    onActivateLead={activateExternalLead}
                  />
                  
                  {/* Pagination Controls */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-t pt-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
                      <p className="text-xs sm:text-sm text-muted-foreground">
                        Page {pagination.currentPage} of {pagination.totalPages} ({pagination.totalResults} total)
                      </p>
                      <div className="flex items-center gap-2">
                        <span className="text-xs sm:text-sm text-muted-foreground">Show:</span>
                        <Select
                          value={pageSize.toString()}
                          onValueChange={(value) => {
                            const newSize = parseInt(value);
                            setPageSize(newSize);
                            if (Object.keys(externalFilters).length > 0) {
                              fetchExternalLeads({ ...externalFilters, limit: newSize, page: 1 });
                            }
                          }}
                        >
                          <SelectTrigger className="w-16 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="10">10</SelectItem>
                            <SelectItem value="25">25</SelectItem>
                            <SelectItem value="50">50</SelectItem>
                            <SelectItem value="100">100</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    {pagination.totalPages > 1 && (
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(pagination.currentPage - 1)}
                          disabled={pagination.currentPage <= 1 || externalLoading}
                        >
                          <ChevronLeft className="w-4 h-4 mr-1" />
                          Previous
                        </Button>
                        
                        {/* Page number buttons */}
                        <div className="flex items-center gap-1">
                          {Array.from({ length: Math.min(5, pagination.totalPages) }, (_, i) => {
                            let pageNum: number;
                            if (pagination.totalPages <= 5) {
                              pageNum = i + 1;
                            } else if (pagination.currentPage <= 3) {
                              pageNum = i + 1;
                            } else if (pagination.currentPage >= pagination.totalPages - 2) {
                              pageNum = pagination.totalPages - 4 + i;
                            } else {
                              pageNum = pagination.currentPage - 2 + i;
                            }
                            
                            return (
                              <Button
                                key={pageNum}
                                variant={pageNum === pagination.currentPage ? "default" : "outline"}
                                size="sm"
                                className="w-8 h-8 p-0"
                                onClick={() => goToPage(pageNum)}
                                disabled={externalLoading}
                              >
                                {pageNum}
                              </Button>
                            );
                          })}
                        </div>
                        
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => goToPage(pagination.currentPage + 1)}
                          // hasNextPage follows the provider's cursor when there
                          // is one; the page count is an estimate and would stop
                          // paging early.
                          disabled={!pagination.hasNextPage || externalLoading}
                        >
                          Next
                          <ChevronRight className="w-4 h-4 ml-1" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 space-y-3">
                  {/* An outage is not an empty match set. Telling someone to
                      loosen filters while the data network is down sends them
                      to edit an ICP that was never the problem. */}
                  <p className="text-muted-foreground">
                    {disclosure.providerUnavailable
                      ? disclosure.message ||
                        "Our lead data network is temporarily unavailable, so this search could not be completed. Your search credit was not used — please try again shortly."
                      : "No leads match that exactly. Nothing broader is shown by default — results that stopped matching your description are worse than none."}
                  </p>
                  {/* Which filters produced nothing. "Try different criteria" is
                      not actionable without knowing what was actually sent. */}
                  {!disclosure.providerUnavailable &&
                    Array.isArray(disclosure.applied) &&
                    disclosure.applied.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      searched:{" "}
                      <span className="text-foreground">
                        {(disclosure.applied as string[]).join(" · ")}
                      </span>
                    </p>
                  )}
                  {disclosure.canBroaden &&
                    (externalFilters.industry || externalFilters.keywords?.length) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        fetchExternalLeads({ ...externalFilters, relax: true, page: 1 })
                      }
                      disabled={externalLoading}
                    >
                      Broaden this search
                    </Button>
                  )}
                </div>
              )}
            </PanelBody>
          </Panel>
        )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Leads;
