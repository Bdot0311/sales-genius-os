import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { AddLeadDialog } from "@/components/dashboard/AddLeadDialog";
import { ImportLeadsDialog } from "@/components/dashboard/ImportLeadsDialog";
import { FilterLeadsDialog, LeadFilters } from "@/components/dashboard/FilterLeadsDialog";
import { Search, Download } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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
  }, []);

  const filteredLeads = leads.filter((lead) => {
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
  });

  const handleExport = () => {
    const csv = [
      "Company Name,Contact Name,Email,Phone,Industry,Company Size,Source,ICP Score,Created At",
      ...filteredLeads.map(lead => 
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
      description: `Exported ${filteredLeads.length} leads`,
    });
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

        <Card>
          <CardHeader>
            <CardTitle>All Leads ({filteredLeads.length})</CardTitle>
            <CardDescription>
              View and manage all your leads in one place
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search leads by name, company, or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <FilterLeadsDialog 
                onApplyFilters={setFilters}
                currentFilters={filters}
              />
              <Button variant="outline" onClick={handleExport}>
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-muted-foreground">
                Loading leads...
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {searchQuery ? "No leads found matching your search" : "No leads yet. Add your first lead to get started!"}
              </div>
            ) : (
              <div className="space-y-3">
                {filteredLeads.map((lead) => (
                  <Card key={lead.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
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
    </DashboardLayout>
  );
};

export default Leads;
