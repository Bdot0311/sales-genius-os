import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { ImportLeadsDialog } from "@/components/dashboard/ImportLeadsDialog";
import { LeadAssignmentDialog } from "@/components/dashboard/LeadAssignmentDialog";
import { LeadActivityTimeline } from "@/components/dashboard/LeadActivityTimeline";
import { LeadsTableView } from "@/components/dashboard/LeadsTableView";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Search, Download, ArrowUpDown, Trash2, Plus, Save, Star, UserPlus, LayoutGrid, Table as TableIcon, Sparkles } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { subDays, startOfMonth } from "date-fns";

interface LeadFilters {
  source?: string;
  industry?: string;
  company_size?: string;
  min_score?: number;
  max_score?: number;
  date_range?: "all" | "last_7_days" | "last_30_days" | "this_month";
  last_contacted?: "all" | "contacted" | "not_contacted";
  score_changed?: "all" | "changed_this_month";
}

type SortField = "created_at" | "icp_score" | "company_name" | "company_size";
type SortOrder = "asc" | "desc";

interface SavedPreset {
  id: string;
  name: string;
  filters: LeadFilters;
}

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
}

const Leads = () => {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<LeadFilters>({});
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [selectedLeads, setSelectedLeads] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [savedPresets, setSavedPresets] = useState<SavedPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [showAssignDialog, setShowAssignDialog] = useState(false);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");
  const [enrichingLeads, setEnrichingLeads] = useState<Set<string>>(new Set());
  const { toast } = useToast();

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
    fetchPresets();
  }, []);

  const fetchPresets = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data, error } = await supabase
        .from("lead_search_presets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const typedPresets: SavedPreset[] = (data || []).map(preset => ({
        id: preset.id,
        name: preset.name,
        filters: preset.filters as LeadFilters,
      }));
      
      setSavedPresets(typedPresets);
    } catch (error: any) {
      console.error("Error loading presets:", error);
    }
  };

  const filteredAndSortedLeads = leads
    .filter((lead) => {
      const matchesSearch = 
        lead.company_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        lead.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (lead.contact_email?.toLowerCase().includes(searchQuery.toLowerCase()) || false);

      const matchesSource = !filters.source || filters.source === "all" || lead.source === filters.source;
      const matchesIndustry = !filters.industry || filters.industry === "all" || lead.industry === filters.industry;
      const matchesSize = !filters.company_size || filters.company_size === "all" || lead.company_size === filters.company_size;
      const matchesMinScore = !filters.min_score || (lead.icp_score || 0) >= filters.min_score;
      const matchesMaxScore = !filters.max_score || (lead.icp_score || 0) <= filters.max_score;

      // Date range filter
      let matchesDateRange = true;
      if (filters.date_range && filters.date_range !== "all") {
        const createdDate = new Date(lead.created_at);
        const now = new Date();
        
        if (filters.date_range === "last_7_days") {
          matchesDateRange = createdDate >= subDays(now, 7);
        } else if (filters.date_range === "last_30_days") {
          matchesDateRange = createdDate >= subDays(now, 30);
        } else if (filters.date_range === "this_month") {
          matchesDateRange = createdDate >= startOfMonth(now);
        }
      }

      // Last contacted filter
      let matchesLastContacted = true;
      if (filters.last_contacted && filters.last_contacted !== "all") {
        const hasContacted = (lead as any).last_contacted_at !== null;
        matchesLastContacted = filters.last_contacted === "contacted" ? hasContacted : !hasContacted;
      }

      // Score changed filter
      let matchesScoreChanged = true;
      if (filters.score_changed === "changed_this_month") {
        const scoreChangedDate = (lead as any).score_changed_at;
        if (scoreChangedDate) {
          matchesScoreChanged = new Date(scoreChangedDate) >= startOfMonth(new Date());
        } else {
          matchesScoreChanged = false;
        }
      }

      return matchesSearch && matchesSource && matchesIndustry && matchesSize && 
             matchesMinScore && matchesMaxScore && matchesDateRange && 
             matchesLastContacted && matchesScoreChanged;
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

  const handleSavePreset = async () => {
    if (!presetName.trim()) {
      toast({
        title: "Name required",
        description: "Please enter a name for this preset",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { error } = await supabase
        .from("lead_search_presets")
        .insert([{
          user_id: session.user.id,
          name: presetName,
          filters: filters as any,
        }]);

      if (error) throw error;

      toast({
        title: "Preset saved",
        description: `"${presetName}" has been saved`,
      });

      setPresetName("");
      setShowSavePreset(false);
      fetchPresets();
    } catch (error: any) {
      toast({
        title: "Error saving preset",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const applyPreset = (preset: SavedPreset) => {
    setFilters(preset.filters);
    toast({
      title: "Preset applied",
      description: `Applied "${preset.name}" filters`,
    });
  };

  const deletePreset = async (presetId: string) => {
    try {
      const { error } = await supabase
        .from("lead_search_presets")
        .delete()
        .eq("id", presetId);

      if (error) throw error;

      toast({
        title: "Preset deleted",
      });

      fetchPresets();
    } catch (error: any) {
      toast({
        title: "Error deleting preset",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getScoreBadge = (score?: number) => {
    if (!score) return <Badge variant="secondary">Not Scored</Badge>;
    if (score >= 80) return <Badge className="bg-green-500">High: {score}</Badge>;
    if (score >= 50) return <Badge className="bg-yellow-500">Medium: {score}</Badge>;
    return <Badge variant="destructive">Low: {score}</Badge>;
  };

  const handleEnrichLead = async (leadId: string) => {
    setEnrichingLeads(prev => new Set(prev).add(leadId));
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated');
      }

      const { data, error } = await supabase.functions.invoke('enrich-lead', {
        body: { leadId }
      });

      if (error) throw error;

      toast({
        title: "Lead enriched",
        description: data.message || "Successfully enriched lead data",
      });

      fetchLeads();
    } catch (error: any) {
      toast({
        title: "Enrichment failed",
        description: error.message || "Failed to enrich lead. Make sure Apollo.io is configured in Settings > Integrations.",
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Leads</h1>
            <p className="text-muted-foreground">Manage and track your sales leads</p>
          </div>
          <div className="flex gap-2">
            <ImportLeadsDialog onImportComplete={fetchLeads} />
            <AddLeadDialog onLeadAdded={fetchLeads} />
          </div>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Left Side - Search Criteria */}
          <div className="col-span-12 lg:col-span-3 space-y-4">
            {/* Saved Presets */}
            {savedPresets.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="w-4 h-4" />
                    Saved Presets
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {savedPresets.map((preset) => (
                    <div key={preset.id} className="flex items-center justify-between gap-2 p-2 hover:bg-muted rounded-md">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => applyPreset(preset)}
                        className="flex-1 justify-start"
                      >
                        {preset.name}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deletePreset(preset.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Search Criteria</CardTitle>
                <CardDescription>Filter your leads</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="source">Source</Label>
                  <Select 
                    value={filters.source || "all"} 
                    onValueChange={(value) => setFilters({ ...filters, source: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All sources" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      <SelectItem value="Apollo">Apollo</SelectItem>
                      <SelectItem value="Crunchbase">Crunchbase</SelectItem>
                      <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                      <SelectItem value="Website">Website</SelectItem>
                      <SelectItem value="Manual">Manual</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="industry">Industry</Label>
                  <Select 
                    value={filters.industry || "all"} 
                    onValueChange={(value) => setFilters({ ...filters, industry: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All industries" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All industries</SelectItem>
                      <SelectItem value="Technology">Technology</SelectItem>
                      <SelectItem value="Healthcare">Healthcare</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                      <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="Retail">Retail</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="company_size">Company Size</Label>
                  <Select 
                    value={filters.company_size || "all"} 
                    onValueChange={(value) => setFilters({ ...filters, company_size: value === "all" ? undefined : value })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All sizes" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sizes</SelectItem>
                      <SelectItem value="1-10">1-10</SelectItem>
                      <SelectItem value="11-50">11-50</SelectItem>
                      <SelectItem value="51-200">51-200</SelectItem>
                      <SelectItem value="201-500">201-500</SelectItem>
                      <SelectItem value="501-1000">501-1000</SelectItem>
                      <SelectItem value="1000+">1000+</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="min_score">Min ICP Score</Label>
                  <Input
                    id="min_score"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="0"
                    value={filters.min_score || ""}
                    onChange={(e) => setFilters({ ...filters, min_score: parseInt(e.target.value) || undefined })}
                  />
                </div>

                <div>
                  <Label htmlFor="max_score">Max ICP Score</Label>
                  <Input
                    id="max_score"
                    type="number"
                    min="0"
                    max="100"
                    placeholder="100"
                    value={filters.max_score || ""}
                    onChange={(e) => setFilters({ ...filters, max_score: parseInt(e.target.value) || undefined })}
                  />
                </div>

                <div>
                  <Label htmlFor="date_range">Date Added</Label>
                  <Select 
                    value={filters.date_range || "all"} 
                    onValueChange={(value) => setFilters({ ...filters, date_range: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All time</SelectItem>
                      <SelectItem value="last_7_days">Last 7 days</SelectItem>
                      <SelectItem value="last_30_days">Last 30 days</SelectItem>
                      <SelectItem value="this_month">This month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="last_contacted">Contact Status</Label>
                  <Select 
                    value={filters.last_contacted || "all"} 
                    onValueChange={(value) => setFilters({ ...filters, last_contacted: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="contacted">Contacted</SelectItem>
                      <SelectItem value="not_contacted">Not contacted</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="score_changed">Score Updates</Label>
                  <Select 
                    value={filters.score_changed || "all"} 
                    onValueChange={(value) => setFilters({ ...filters, score_changed: value as any })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="changed_this_month">Changed this month</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setFilters({})}
                    className="flex-1"
                  >
                    Reset
                  </Button>
                  {!showSavePreset ? (
                    <Button 
                      variant="outline"
                      onClick={() => setShowSavePreset(true)}
                      className="flex-1"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      Save
                    </Button>
                  ) : (
                    <div className="flex gap-2 w-full">
                      <Input
                        placeholder="Preset name"
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        className="flex-1"
                      />
                      <Button onClick={handleSavePreset} size="sm">
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Side - Results */}
          <div className="col-span-12 lg:col-span-9">
            <Card>
              <CardHeader>
                <CardTitle>All Leads ({filteredAndSortedLeads.length})</CardTitle>
                <CardDescription>
                  View and manage all your leads in one place
                </CardDescription>
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
                    {searchQuery || Object.keys(filters).length > 0 
                      ? "No leads found matching your criteria" 
                      : "No leads yet. Add your first lead to get started!"}
                  </div>
                ) : viewMode === "table" ? (
                  <LeadsTableView
                    leads={filteredAndSortedLeads}
                    selectedLeads={Array.from(selectedLeads)}
                    onSelectLead={toggleSelectLead}
                    onSelectAll={(checked) => checked ? setSelectedLeads(new Set(filteredAndSortedLeads.map(l => l.id))) : setSelectedLeads(new Set())}
                    onLeadClick={(lead) => setSelectedLead(lead as Lead)}
                  />
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 py-2 border-b">
                      <Checkbox
                        checked={selectedLeads.size === filteredAndSortedLeads.length}
                        onCheckedChange={toggleSelectAll}
                      />
                      <span className="text-sm text-muted-foreground">
                        {selectedLeads.size > 0 ? `${selectedLeads.size} selected` : "Select all"}
                      </span>
                    </div>
                    
                    {filteredAndSortedLeads.map((lead) => (
                      <Card key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedLead(lead)}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedLeads.has(lead.id)}
                              onCheckedChange={() => toggleSelectLead(lead.id)}
                              className="mt-1"
                              onClick={(e) => e.stopPropagation()}
                            />
                            <div className="space-y-1 flex-1">
                              <div className="flex items-center gap-3">
                                <h3 className="font-semibold text-lg">{lead.contact_name}</h3>
                                {getScoreBadge(lead.icp_score)}
                              </div>
                              <p className="text-sm text-muted-foreground">{lead.company_name}</p>
                              <div className="flex gap-4 text-sm text-muted-foreground">
                                <span>{lead.contact_email}</span>
                                {lead.contact_phone && <span>{lead.contact_phone}</span>}
                              </div>
                              {lead.industry && (
                                <Badge variant="outline">{lead.industry}</Badge>
                              )}
                              {lead.source && (
                                <Badge variant="secondary" className="ml-2">{lead.source}</Badge>
                              )}
                              {lead.notes && (
                                <p className="text-sm text-muted-foreground mt-2">{lead.notes}</p>
                              )}
                            </div>
                            <div className="flex flex-col gap-2 items-end">
                              <div className="text-sm text-muted-foreground">
                                {new Date(lead.created_at).toLocaleDateString()}
                              </div>
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
        </div>
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

      <Sheet open={!!selectedLead} onOpenChange={(open) => !open && setSelectedLead(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedLead?.contact_name}</SheetTitle>
          </SheetHeader>
          {selectedLead && (
            <div className="space-y-6 mt-6">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Company</h3>
                <p className="text-sm">{selectedLead.company_name}</p>
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Contact</h3>
                <p className="text-sm">{selectedLead.contact_email}</p>
                {selectedLead.contact_phone && <p className="text-sm">{selectedLead.contact_phone}</p>}
              </div>
              {selectedLead.industry && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Industry</h3>
                  <p className="text-sm">{selectedLead.industry}</p>
                </div>
              )}
              {selectedLead.company_size && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Company Size</h3>
                  <p className="text-sm">{selectedLead.company_size}</p>
                </div>
              )}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">ICP Score</h3>
                {getScoreBadge(selectedLead.icp_score)}
              </div>
              {selectedLead.notes && (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold">Notes</h3>
                  <p className="text-sm">{selectedLead.notes}</p>
                </div>
              )}
              <div className="border-t pt-6">
                <LeadActivityTimeline leadId={selectedLead.id} />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </DashboardLayout>
  );
};

export default Leads;
