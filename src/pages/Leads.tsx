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
import { Sparkles, Loader2, Users, RefreshCw, Lock, CreditCard, ChevronLeft, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExternalLeads, ExternalLeadFilters } from "@/hooks/use-external-leads";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { useSearchCredits } from "@/hooks/use-search-credits";
import { useRealtimeTable } from "@/hooks/use-realtime-table";


const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [externalFilters, setExternalFilters] = useState<ExternalLeadFilters>({});
  const [showExternalLeads, setShowExternalLeads] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const [pageSize, setPageSize] = useState(10);
  const { toast } = useToast();
  const navigate = useNavigate();
  const { status: subscriptionStatus, loading: subscriptionLoading } = useSubscriptionStatus();
  const { credits, canSearch, useCredit } = useSearchCredits();
  
  const {
    leads: externalLeads,
    loading: externalLoading,
    activatingLead: externalActivating,
    pagination,
    fetchLeads: fetchExternalLeads,
    activateLead: activateExternalLead,
    clearLeads: clearExternalLeads,
    goToPage,
  } = useExternalLeads();

  // Check if user can access lead gen (must be paid, not trial)
  const canAccessLeadGen = subscriptionStatus?.isPaidUser === true;

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

        {/* Trial User Lock Screen */}
        {!subscriptionLoading && !canAccessLeadGen && (
          <Card className="border-2 border-dashed border-muted-foreground/25">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-6">
                <Lock className="w-8 h-8 text-muted-foreground" />
              </div>
              <h2 className="text-2xl font-bold mb-2">Lead Generation is a Paid Feature</h2>
              <p className="text-muted-foreground max-w-md mb-6">
                {subscriptionStatus?.isTrialUser 
                  ? "AI Lead Generation is not included in your free trial. Upgrade to a paid plan starting at $39/month to unlock access to our B2B lead database."
                  : "Subscribe to a paid plan starting at $39/month to unlock AI-powered lead generation and access millions of B2B contacts."
                }
              </p>
              <Button onClick={() => navigate('/pricing')} size="lg" className="gap-2">
                <CreditCard className="w-4 h-4" />
                Upgrade Now
              </Button>
              <p className="text-sm text-muted-foreground mt-4">
                Cancel anytime • Instant access after upgrade
              </p>
            </CardContent>
          </Card>
        )}

        {/* AI Command Interface - Hero Section (only show for paid users) */}
        {canAccessLeadGen && (
          <>
            <AILeadCommand
              onSearch={async (query) => {
                // Check if user can search
                if (!canSearch) {
                  toast({
                    title: "Search limit reached",
                    description: credits?.remainingCredits === 0 
                      ? "You've used all your search credits. Purchase a credit pack or upgrade your plan to continue."
                      : "You've reached your daily search limit. Try again tomorrow.",
                    variant: "destructive",
                  });
                  return;
                }

                // Deduct credit before searching
                const creditResult = await useCredit(1, `Lead search: ${query.substring(0, 50)}`);
                if (!creditResult.success) {
                  return;
                }

                setAiSearchQuery(query);
                setShowExternalLeads(true);
                
                try {
                  const { data, error } = await supabase.functions.invoke('parse-lead-query', {
                    body: { query }
                  });
                  
                  if (error) throw error;
                  
                  const aiFilters = data?.filters || {};
                  const newFilters: ExternalLeadFilters = {
                    limit: pageSize,
                  };
                  
                  // Use job titles if available
                  if (aiFilters.jobTitles?.length > 0) {
                    newFilters.job_title = aiFilters.jobTitles.join(' OR ');
                  }

                  // Industry: ignore generic "B2B" (it kills recall in Railway)
                  const rawIndustry = aiFilters.industries?.[0]?.trim();
                  if (rawIndustry && !/^b2b$/i.test(rawIndustry)) {
                    newFilters.industry = rawIndustry;
                  } else if (rawIndustry) {
                    newFilters.keywords = [...(newFilters.keywords || []), rawIndustry];
                  }

                  // Company size: only allow known buckets
                  const rawSize = aiFilters.companySizes?.[0]?.trim();
                  const allowedSizes = new Set(["1-10","11-50","51-200","201-500","501-1000","1000+"]);
                  if (rawSize && allowedSizes.has(rawSize)) {
                    newFilters.company_size = rawSize;
                  }

                  if (aiFilters.locations?.length > 0) {
                    newFilters.country = aiFilters.locations[0];
                  }
                  
                  // Pass keywords for fallback extraction in edge function
                  if (aiFilters.keywords?.length > 0) {
                    newFilters.keywords = aiFilters.keywords;
                  }
                  
                  // If no job titles but keywords exist, try to build job_title from keywords
                  if (!newFilters.job_title && aiFilters.keywords?.length > 0) {
                    const jobKeywords = aiFilters.keywords.filter((k: string) => 
                      /ceo|cto|cfo|founder|director|vp|head|manager|executive|owner/i.test(k)
                    );
                    if (jobKeywords.length > 0) {
                      newFilters.job_title = jobKeywords.join(' OR ');
                    }
                  }
                  
                  setExternalFilters(newFilters);
                  fetchExternalLeads(newFilters);
                } catch (error) {
                  console.error('AI parsing failed, using fallback:', error);
                  const lowerQuery = query.toLowerCase();
                  const newFilters: ExternalLeadFilters = { limit: pageSize };

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
                    [/gtm|go.to.market/i, 'GTM Manager OR Growth Manager OR Marketing Manager'],
                    [/revops|revenue\s+operations/i, 'Revenue Operations Manager'],
                    [/sales\s+director|director.*sales/i, 'Sales Director'],
                    [/director/i, 'Director'],
                    [/account\s+executive|ae\b/i, 'Account Executive'],
                    [/sdr|bdr|business\s+development\s+rep/i, 'SDR OR BDR'],
                    [/sales\s+manager/i, 'Sales Manager'],
                    [/product\s+manager|pm\b/i, 'Product Manager'],
                    [/engineer|developer|dev\b/i, 'Software Engineer OR Developer'],
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
                <div className="text-center py-8 text-muted-foreground">
                  No leads found matching your criteria. Try a different query.
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
