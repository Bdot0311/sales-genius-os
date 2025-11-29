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
import { Search, Download, ArrowUpDown, Trash2, Plus, Save, Star } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LeadFilters {
  source?: string;
  industry?: string;
  company_size?: string;
  min_score?: number;
  max_score?: number;
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

      return matchesSearch && matchesSource && matchesIndustry && matchesSize && matchesMinScore && matchesMaxScore;
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
                      <Card key={lead.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={selectedLeads.has(lead.id)}
                              onCheckedChange={() => toggleSelectLead(lead.id)}
                              className="mt-1"
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
    </DashboardLayout>
  );
};

export default Leads;
