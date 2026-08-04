import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { PageHeader } from "@/components/dashboard/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { ImportLeadsDialog } from "@/components/dashboard/ImportLeadsDialog";
import { ExternalLeadsTable } from "@/components/dashboard/ExternalLeadsTable";
import { AILeadCommand } from "@/components/dashboard/AILeadCommand";
import { DomainICPBuilder } from "@/components/dashboard/DomainICPBuilder";
import { TargetCompanies } from "@/components/dashboard/TargetCompanies";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { buildExternalFilters, ParsedIcpFilters } from "@/lib/lead-filters";
import { Sparkles, Loader2, Users, RefreshCw, Lock, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
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
          <>
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/leads/saved')}>
              <Users className="w-4 h-4 mr-2" />
              Saved Leads
              {leads.length > 0 && <Badge variant="secondary" className="ml-2">{leads.length}</Badge>}
            </Button>
            <ImportLeadsDialog onImportComplete={fetchLeads} />
            <AddLeadDialog onLeadAdded={fetchLeads} />
          </>
        }
      />
      <div className="px-6 py-6 space-y-6 max-w-[1400px] mx-auto">

        {/* Free-leads exhausted upsell — shown only after the 100 free leads are used */}
        {isOutOfFreeLeads && (
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-5">
                <Sparkles className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-2xl font-bold mb-2">You've used your {PLAN_SEARCH_LIMITS.free.monthlySearchCredits} free lead searches</h2>
              <p className="text-muted-foreground max-w-md mb-6">
                Nice work exploring the lead engine. Upgrade to a paid plan to unlock thousands of monthly searches and verified contact data.
              </p>
              <Button onClick={() => navigate('/pricing')} size="lg" className="gap-2">
                <CreditCard className="w-4 h-4" />
                Upgrade to get more leads
              </Button>
              <p className="text-sm text-muted-foreground mt-3">
                Plans from $39/mo · Cancel anytime
              </p>
            </CardContent>
          </Card>
        )}


        {/* AI Command Interface - Hero Section (only show for paid users) */}
        {canAccessLeadGen && (
          <>
            <Tabs value={inputTab} onValueChange={setInputTab} className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="describe">Describe your ICP</TabsTrigger>
                <TabsTrigger value="website">Analyze your website</TabsTrigger>
                <TabsTrigger value="companies">Target companies</TabsTrigger>
              </TabsList>

              <TabsContent value="describe">
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
              resultsCount={externalLeads.length}
              showResults={showExternalLeads && externalLeads.length > 0 && !externalLoading}
            />
              </TabsContent>

              <TabsContent value="website">
                <DomainICPBuilder
                  onFindLeads={handleDomainFindLeads}
                  onSwitchToDescribe={() => setInputTab("describe")}
                  isSearching={externalLoading}
                />
              </TabsContent>

              <TabsContent value="companies">
                <TargetCompanies
                  onFindLeads={handleCompaniesFindLeads}
                  isSearching={externalLoading}
                />
              </TabsContent>
            </Tabs>

            {/* AI-Discovered Leads Section */}
            {showExternalLeads && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <CardTitle className="text-base sm:text-lg">AI-Discovered Leads</CardTitle>
                  {externalLeads.length > 0 && (
                    <Badge variant="secondary">{externalLeads.length} found</Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      clearExternalLeads();
                      setShowExternalLeads(false);
                      setAiSearchQuery("");
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Start New Search
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      clearExternalLeads();
                      setShowExternalLeads(false);
                      setAiSearchQuery("");
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
              {aiSearchQuery && (
                <CardDescription>Results for: "{aiSearchQuery}"</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              {externalLoading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span>Searching B2B data sources...</span>
                </div>
              ) : externalLeads.length > 0 ? (
                <div className="space-y-4">
                  {disclosure.relaxed.length > 0 && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                      No exact matches, so these results ignore your{" "}
                      <span className="font-medium">{disclosure.relaxed.join(" and ")}</span>{" "}
                      {disclosure.relaxed.length > 1 ? "filters" : "filter"}. They are broader than what you asked for.
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
                          disabled={pagination.currentPage >= pagination.totalPages || externalLoading}
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
                  <p className="text-muted-foreground">
                    No leads match that exactly. Nothing broader is shown by default — results
                    that stopped matching your description are worse than none.
                  </p>
                  {(externalFilters.industry || externalFilters.keywords?.length) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        fetchExternalLeads({ ...externalFilters, relax: true, page: 1 })
                      }
                      disabled={externalLoading}
                    >
                      Search again without the industry filter
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
};

export default Leads;
