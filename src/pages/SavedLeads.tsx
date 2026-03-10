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
import { Search, Download, ArrowUpDown, Trash2, UserPlus, LayoutGrid, Table as TableIcon, ArrowLeft, CheckCircle, Sparkles, AlertCircle } from "lucide-react";
import { Progress } from "@/components/ui/progress";
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
  linkedin_url?: string;
  job_title?: string;
  company_website?: string;
  enrichment_status?: string;
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
  const [viewMode, setViewMode] = useState<"card" | "table">("table");
  const [enrichmentHistory, setEnrichmentHistory] = useState<any[]>([]);
  const [isEnriching, setIsEnriching] = useState(false);
  const [bulkEnriching, setBulkEnriching] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, succeeded: 0, failed: 0 });
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

  const handleLeadClick = async (lead: Lead) => {
    setSelectedLead(lead);
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

      if (data?.noMatch) {
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
    setBulkProgress({ current: 0, total: leadIds.length, succeeded: 0, failed: 0 });
    
    let succeeded = 0;
    let failed = 0;
    
    for (let i = 0; i < leadIds.length; i++) {
      setBulkProgress(prev => ({ ...prev, current: i + 1 }));
      try {
        const { data, error } = await supabase.functions.invoke('enrich-lead', {
          body: { leadId: leadIds[i] }
        });
        if (error || data?.error || data?.noMatch) {
          failed++;
        } else {
          succeeded++;
        }
      } catch {
        failed++;
      }
    }
    
    setBulkProgress({ current: leadIds.length, total: leadIds.length, succeeded, failed });
    await fetchLeads();
    
    toast({
      title: "Bulk enrichment complete",
      description: `${succeeded} enriched, ${failed} failed out of ${leadIds.length} leads`,
      variant: failed === leadIds.length ? "destructive" : "default",
    });
    
    setBulkEnriching(false);
    setSelectedLeads(new Set());
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
                    <Sparkles className={`w-4 h-4 mr-2 ${bulkEnriching ? 'animate-spin' : ''}`} />
                    {bulkEnriching 
                      ? `Enriching ${bulkProgress.current}/${bulkProgress.total}...` 
                      : `Enrich (${selectedLeads.size})`}
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

            {bulkEnriching && (
              <div className="space-y-2 p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Enriching leads... {bulkProgress.current}/{bulkProgress.total}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ✓ {bulkProgress.succeeded} enriched · ✗ {bulkProgress.failed} failed
                  </span>
                </div>
                <Progress value={(bulkProgress.current / bulkProgress.total) * 100} className="h-2" />
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
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-3 text-left">
                        <Checkbox
                          checked={selectedLeads.size === filteredAndSortedLeads.length && filteredAndSortedLeads.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="p-3 text-left text-sm font-medium">Contact</th>
                      <th className="p-3 text-left text-sm font-medium">Company</th>
                      <th className="p-3 text-left text-sm font-medium">Industry</th>
                      <th className="p-3 text-left text-sm font-medium">ICP Score</th>
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
                        <td className="p-3">
                          {getScoreBadge(lead.icp_score)}
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
                            {getScoreBadge(lead.icp_score)}
                            <Badge variant="default" className="text-xs">
                              <CheckCircle className="w-3 h-3 mr-1" />
                              Enriched
                            </Badge>
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
            .update(updates)
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
