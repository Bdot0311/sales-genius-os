import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { ImportLeadsDialog } from "@/components/dashboard/ImportLeadsDialog";
import { ExternalLeadsTable } from "@/components/dashboard/ExternalLeadsTable";
import { AILeadCommand } from "@/components/dashboard/AILeadCommand";
import { Sparkles, Loader2, Users, RefreshCw, Lock, CreditCard } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExternalLeads, ExternalLeadFilters } from "@/hooks/use-external-leads";
import { useSubscriptionStatus } from "@/hooks/use-subscription-status";
import { useSearchCredits } from "@/hooks/use-search-credits";
const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [externalFilters, setExternalFilters] = useState<ExternalLeadFilters>({});
  const [showExternalLeads, setShowExternalLeads] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();
  const { status: subscriptionStatus, loading: subscriptionLoading } = useSubscriptionStatus();
  const { credits, canSearch, useCredit } = useSearchCredits();
  
  const {
    leads: externalLeads,
    loading: externalLoading,
    activatingLead: externalActivating,
    fetchLeads: fetchExternalLeads,
    activateLead: activateExternalLead,
    clearLeads: clearExternalLeads,
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">AI Lead Generation</h1>
            <p className="text-muted-foreground">Describe your ideal customer and let AI find them</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate('/dashboard/leads/saved')}>
              <Users className="w-4 h-4 mr-2" />
              Saved Leads
              {leads.length > 0 && <Badge variant="secondary" className="ml-2">{leads.length}</Badge>}
            </Button>
            <ImportLeadsDialog onImportComplete={fetchLeads} />
            <AddLeadDialog onLeadAdded={fetchLeads} />
          </div>
        </div>

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
                  ? "AI Lead Generation is not included in your free trial. Upgrade to a paid plan to unlock unlimited access to our B2B lead database."
                  : "Subscribe to a paid plan to unlock AI-powered lead generation and access millions of B2B contacts."
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
                      ? "You've used all your monthly search credits. Add more credits to continue."
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
                    limit: aiFilters.limit || 50,
                  };
                  
                  // Use job titles if available
                  if (aiFilters.jobTitles?.length > 0) {
                    newFilters.job_title = aiFilters.jobTitles.join(' OR ');
                  }
                  if (aiFilters.industries?.length > 0) {
                    newFilters.industry = aiFilters.industries[0];
                  }
                  if (aiFilters.companySizes?.length > 0) {
                    newFilters.company_size = aiFilters.companySizes[0];
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
                  const newFilters: ExternalLeadFilters = { limit: 50 };
                  
                  if (lowerQuery.includes('ceo') || lowerQuery.includes('founder')) {
                    newFilters.job_title = lowerQuery.includes('ceo') ? 'CEO' : 'Founder';
                  }
                  if (lowerQuery.includes('fintech') || lowerQuery.includes('saas') || lowerQuery.includes('tech')) {
                    newFilters.industry = 'Technology';
                  }
                  
                  const countMatch = lowerQuery.match(/(\d+)\s*(leads?|founders?|ceos?|prospects?)/i);
                  if (countMatch) {
                    newFilters.limit = Math.min(parseInt(countMatch[1]), 100);
                  }
                  
                  setExternalFilters(newFilters);
                  fetchExternalLeads(newFilters);
                  
                  toast({
                    title: "Using basic search",
                    description: "AI parsing unavailable, using keyword matching",
                    variant: "default",
                  });
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
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  <CardTitle>AI-Discovered Leads</CardTitle>
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
                <ExternalLeadsTable
                  leads={externalLeads}
                  activatingLead={externalActivating}
                  onActivateLead={activateExternalLead}
                />
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
