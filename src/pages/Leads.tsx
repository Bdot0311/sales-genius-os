import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { ImportLeadsDialog } from "@/components/dashboard/ImportLeadsDialog";
import { ExternalLeadsTable } from "@/components/dashboard/ExternalLeadsTable";
import { AILeadCommand } from "@/components/dashboard/AILeadCommand";
import { Sparkles, Loader2, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useExternalLeads, ExternalLeadFilters } from "@/hooks/use-external-leads";

const Leads = () => {
  const [leads, setLeads] = useState<any[]>([]);
  const [externalFilters, setExternalFilters] = useState<ExternalLeadFilters>({});
  const [showExternalLeads, setShowExternalLeads] = useState(false);
  const [aiSearchQuery, setAiSearchQuery] = useState("");
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const {
    leads: externalLeads,
    loading: externalLoading,
    activatingLead: externalActivating,
    fetchLeads: fetchExternalLeads,
    activateLead: activateExternalLead,
    clearLeads: clearExternalLeads,
  } = useExternalLeads();

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

        {/* AI Command Interface - Hero Section */}
        <AILeadCommand
          onSearch={async (query) => {
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
              
              if (aiFilters.jobTitles?.length > 0) {
                newFilters.job_title = aiFilters.jobTitles[0];
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
      </div>
    </DashboardLayout>
  );
};

export default Leads;
