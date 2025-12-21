import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { LeadAssignmentDialog } from "@/components/dashboard/LeadAssignmentDialog";
import { LeadsTableView } from "@/components/dashboard/LeadsTableView";
import { LeadDetailSheet } from "@/components/dashboard/LeadDetailSheet";
import { Search, Download, ArrowUpDown, Trash2, UserPlus, LayoutGrid, Table as TableIcon, Sparkles, Globe, Loader2, CheckCircle, ArrowLeft } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type SortField = "created_at" | "icp_score" | "company_name" | "company_size";
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
  last_contacted_at?: string;
  score_changed_at?: string;
  lead_status?: string;
  linkedin_url?: string;
  job_title?: string;
  company_website?: string;
}

const SavedLeads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [enrichingLeads, setEnrichingLeads] = useState<Set<string>>(new Set());
  const [enrichmentHistory, setEnrichmentHistory] = useState<any[]>([]);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [activatingLead, setActivatingLead] = useState<string | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchLeads = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false });

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

  const filteredAndSortedLeads = leads
    .filter((lead) => {
      const matchesSearch = 
        lead.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (lead.contact_email?.toLowerCase().includes(searchQuery.toLowerCase()) || false);

      return matchesSearch;
    })
    .sort((a, b) => {
      const statusOrder: Record<string, number> = { 'active': 0, '': 0, 'discovered': 1, 'archived': 2 };
      const statusA = statusOrder[a.lead_status || ''] ?? 0;
      const statusB = statusOrder[b.lead_status || ''] ?? 0;
      
      if (statusA !== statusB) {
        return statusA - statusB;
      }

      let comparison = 0;
      
      switch (sortField) {
        case "created_at":
          comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
        case "icp_score":
          comparison = (a.icp_score || 0) - (b.icp_score || 0);
          break;
        case "company_name":
          comparison = a.company_name.localeCompare(b.company_name);
          break;
        case "company_size":
          const sizeOrder: Record<string, number> = {
            "1-10": 1, "11-50": 2, "51-200": 3, "201-500": 4, "501-1000": 5, "1000+": 6
          };
          comparison = (sizeOrder[a.company_size || ""] || 0) - (sizeOrder[b.company_size || ""] || 0);
          break;
      }
      
      return sortOrder === "asc" ? comparison : -comparison;
    });

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
      const { error } = await supabase
        .from("leads")
        .delete()
        .in("id", Array.from(selectedLeads));

      if (error) throw error;

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

  const handleEnrichLead = async (leadId: string) => {
    setEnrichingLeads(prev => new Set(prev).add(leadId));
    
    try {
      const { data, error } = await supabase.functions.invoke('enrich-lead', {
        body: { leadId }
      });

      if (error) throw error;

      toast({
        title: "Lead enriched",
        description: data.message || "Successfully enriched lead data",
      });

      await fetchLeads();
      if (selectedLead?.id === leadId) {
        await fetchEnrichmentHistory(leadId);
      }
    } catch (error: any) {
      toast({
        title: "Enrichment failed",
        description: error.message || "Failed to enrich lead.",
        variant: "destructive",
      });
    } finally {
      setEnrichingLeads(prev => {
        const next = new Set(prev);
        next.delete(leadId);
        return next;
      });
    }
  };

  const handleBulkEnrich = async () => {
    if (selectedLeads.size === 0) return;
    
    setBulkEnriching(true);
    let successCount = 0;
    let failCount = 0;

    for (const leadId of Array.from(selectedLeads)) {
      try {
        const { error } = await supabase.functions.invoke('enrich-lead', {
          body: { leadId }
        });
        if (error) throw error;
        successCount++;
      } catch (error) {
        failCount++;
      }
    }

    toast({
      title: "Bulk enrichment complete",
      description: `${successCount} leads enriched${failCount > 0 ? `, ${failCount} failed` : ''}`,
    });

    await fetchLeads();
    setSelectedLeads(new Set());
    setBulkEnriching(false);
  };

  const handleLeadClick = async (lead: Lead) => {
    setSelectedLead(lead);
    await fetchEnrichmentHistory(lead.id);
  };

  const getEnrichmentStatusBadge = (status: string | null) => {
    if (!status || status === 'pending') return <Badge variant="outline" className="text-xs">Not Enriched</Badge>;
    if (status === 'enriched') return <Badge variant="default" className="text-xs">✓ Enriched</Badge>;
    if (status === 'failed') return <Badge variant="destructive" className="text-xs">Failed</Badge>;
    return null;
  };

  const getLeadStatusBadge = (status?: string) => {
    if (status === 'discovered') {
      return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs"><Globe className="w-3 h-3 mr-1" />Discovered</Badge>;
    }
    if (status === 'archived') {
      return <Badge variant="secondary" className="text-xs">Archived</Badge>;
    }
    return null;
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

  const activateLead = async (leadId: string) => {
    setActivatingLead(leadId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const lead = leads.find(l => l.id === leadId);
      if (!lead) throw new Error('Lead not found');

      const { error: updateError } = await supabase
        .from('leads')
        .update({ lead_status: 'active' })
        .eq('id', leadId);

      if (updateError) throw updateError;

      toast({
        title: "Lead activated",
        description: "Running enrichment and scoring...",
      });

      try {
        await supabase.functions.invoke('enrich-lead', {
          body: { leadId }
        });
      } catch (enrichError) {
        console.error('Enrichment failed:', enrichError);
      }

      try {
        const { data: scoreData } = await supabase.functions.invoke('score-lead', {
          body: {
            company_name: lead.company_name,
            contact_name: lead.contact_name,
            contact_email: lead.contact_email,
            industry: lead.industry,
            company_size: lead.company_size,
            job_title: lead.job_title,
            source: lead.source,
          }
        });

        if (scoreData?.score) {
          await supabase
            .from('leads')
            .update({ icp_score: scoreData.score })
            .eq('id', leadId);
        }
      } catch (scoreError) {
        console.error('Scoring failed:', scoreError);
      }

      toast({
        title: "Lead fully activated",
        description: "Enrichment and scoring complete. Lead is ready for outreach!",
      });

      await fetchLeads();
    } catch (error: any) {
      toast({
        title: "Error activating lead",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setActivatingLead(null);
    }
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
              <p className="text-muted-foreground">View and manage your saved leads</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All Leads ({filteredAndSortedLeads.length})</CardTitle>
            <CardDescription>Your saved leads database</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search saved leads..."
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
                  <SelectItem value="created_at">Date Added</SelectItem>
                  <SelectItem value="icp_score">ICP Score</SelectItem>
                  <SelectItem value="company_name">Company Name</SelectItem>
                  <SelectItem value="company_size">Company Size</SelectItem>
                </SelectContent>
              </Select>
              
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
                    <Sparkles className="w-4 h-4 mr-2" />
                    {bulkEnriching ? `Enriching ${selectedLeads.size}...` : `Enrich (${selectedLeads.size})`}
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

            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading leads...
              </div>
            ) : filteredAndSortedLeads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery 
                  ? "No leads found matching your search" 
                  : "No leads yet. Add your first lead to get started!"}
              </div>
            ) : viewMode === "table" ? (
              <LeadsTableView
                leads={filteredAndSortedLeads}
                selectedLeads={Array.from(selectedLeads)}
                onSelectLead={toggleSelectLead}
                onSelectAll={(checked) => checked ? setSelectedLeads(new Set(filteredAndSortedLeads.map(l => l.id))) : setSelectedLeads(new Set())}
                onLeadClick={handleLeadClick}
                onActivateLead={activateLead}
                activatingLead={activatingLead}
              />
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
                    className={`cursor-pointer hover:bg-muted/50 ${lead.lead_status === 'discovered' ? 'border-blue-500/30 bg-blue-500/5' : ''}`} 
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
                            {getLeadStatusBadge(lead.lead_status)}
                            {getScoreBadge(lead.icp_score)}
                            {getEnrichmentStatusBadge((lead as any).enrichment_status)}
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
                          {lead.notes && (
                            <p className="text-sm text-muted-foreground mt-2">{lead.notes}</p>
                          )}
                        </div>
                        <div className="flex flex-col gap-2 items-end">
                          <div className="text-sm text-muted-foreground">
                            {new Date(lead.created_at).toLocaleDateString()}
                          </div>
                          {lead.lead_status === 'discovered' ? (
                            <Button
                              variant="hero"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                activateLead(lead.id);
                              }}
                              disabled={activatingLead === lead.id}
                            >
                              {activatingLead === lead.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <CheckCircle className="w-4 h-4 mr-2" />
                              )}
                              {activatingLead === lead.id ? 'Activating...' : 'Activate Lead'}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleEnrichLead(lead.id);
                              }}
                              disabled={enrichingLeads.has(lead.id)}
                            >
                              <Sparkles className="w-4 h-4 mr-2" />
                              {enrichingLeads.has(lead.id) ? 'Enriching...' : 'Enrich'}
                            </Button>
                          )}
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
        onEnrich={() => selectedLead && handleEnrichLead(selectedLead.id)}
        isEnriching={selectedLead ? enrichingLeads.has(selectedLead.id) : false}
      />
    </DashboardLayout>
  );
};

export default SavedLeads;
