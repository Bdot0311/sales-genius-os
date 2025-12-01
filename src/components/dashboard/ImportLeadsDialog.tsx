import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download, Loader2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface ImportLeadsDialogProps {
  onImportComplete?: () => void;
}

export const ImportLeadsDialog = ({ onImportComplete }: ImportLeadsDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>("");
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleCSVUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const text = await file.text();
      const rows = text.split("\n").map(row => row.split(","));
      const headers = rows[0].map(h => h.trim().toLowerCase());
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const leads = rows.slice(1).filter(row => row.length > 1).map(row => {
        const lead: any = { user_id: session.user.id };
        headers.forEach((header, index) => {
          const value = row[index]?.trim();
          if (value) {
            if (header.includes("company")) lead.company_name = value;
            else if (header.includes("contact") && header.includes("name")) lead.contact_name = value;
            else if (header.includes("email")) lead.contact_email = value;
            else if (header.includes("phone")) lead.contact_phone = value;
            else if (header.includes("industry")) lead.industry = value;
            else if (header.includes("size")) lead.company_size = value;
            else if (header.includes("source")) lead.source = value;
          }
        });
        if (!lead.company_name) lead.company_name = "Unknown Company";
        if (!lead.contact_name) lead.contact_name = "Unknown Contact";
        if (source) lead.source = source;
        return lead;
      });

      const { error } = await supabase.from("leads").insert(leads);
      if (error) throw error;

      toast({
        title: "Import successful",
        description: `Imported ${leads.length} leads`,
      });
      setOpen(false);
      onImportComplete?.();
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      fetchIntegrations();
    }
  }, [open]);

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('is_active', true)
        .in('integration_id', ['apollo', 'crunchbase']);

      if (error) throw error;
      setIntegrations(data || []);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    }
  };

  const handleSearchApollo = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      const apolloIntegration = integrations.find(i => i.integration_id === 'apollo');
      if (!apolloIntegration) {
        throw new Error('Apollo integration not configured');
      }

      const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'X-Api-Key': apolloIntegration.config.api_key
        },
        body: JSON.stringify({
          q_keywords: searchQuery,
          page: 1,
          per_page: 10
        })
      });

      if (!response.ok) throw new Error('Apollo search failed');
      
      const data = await response.json();
      setSearchResults(data.people || []);
    } catch (error: any) {
      toast({
        title: "Search failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleImportSelected = async (leads: any[]) => {
    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const formattedLeads = leads.map(lead => ({
        user_id: session.user.id,
        company_name: lead.organization?.name || lead.company || 'Unknown Company',
        contact_name: lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown Contact',
        contact_email: lead.email || null,
        contact_phone: lead.phone_numbers?.[0]?.sanitized_number || null,
        industry: lead.organization?.industry || null,
        company_size: lead.organization?.estimated_num_employees ? `${lead.organization.estimated_num_employees}` : null,
        source: selectedIntegration === 'apollo' ? 'Apollo' : 'Crunchbase',
        job_title: lead.title || null,
        linkedin_url: lead.linkedin_url || null,
        company_website: lead.organization?.website_url || null
      }));

      const { error } = await supabase.from("leads").insert(formattedLeads);
      if (error) throw error;

      toast({
        title: "Import successful",
        description: `Imported ${formattedLeads.length} leads from ${selectedIntegration === 'apollo' ? 'Apollo' : 'Crunchbase'}`,
      });

      setSearchResults([]);
      setSearchQuery("");
      setSelectedIntegration(null);
      setOpen(false);
      onImportComplete?.();
    } catch (error: any) {
      toast({
        title: "Import failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const csv = "Company Name,Contact Name,Email,Phone,Industry,Company Size,Source\nExample Corp,John Doe,john@example.com,555-0100,Technology,50-200,Website";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads_template.csv";
    a.click();
  };

  const getIntegrationStatus = (integrationId: string) => {
    return integrations.find(i => i.integration_id === integrationId);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="w-4 h-4 mr-2" />
          Import Leads
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            Upload leads from CSV or connect your integrations
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="csv">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="csv">CSV Upload</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-4">
            <div>
              <Label htmlFor="source">Lead Source (Optional)</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Apollo">Apollo</SelectItem>
                  <SelectItem value="Crunchbase">Crunchbase</SelectItem>
                  <SelectItem value="LinkedIn">LinkedIn</SelectItem>
                  <SelectItem value="Manual Import">Manual Import</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={handleCSVUpload}
                disabled={loading}
                className="hidden"
              />
              <Label htmlFor="csv-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-sm font-medium">Click to upload CSV file</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Supports: Company Name, Contact Name, Email, Phone, Industry, Company Size, Source
                </p>
              </Label>
            </div>

            <Button variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download CSV Template
            </Button>
          </TabsContent>

          <TabsContent value="integrations" className="space-y-4">
            {selectedIntegration ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">
                    {selectedIntegration === 'apollo' ? 'Search Apollo.io' : 'Search Crunchbase'}
                  </h4>
                  <Button variant="ghost" onClick={() => {
                    setSelectedIntegration(null);
                    setSearchResults([]);
                    setSearchQuery("");
                  }}>
                    Back
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Input
                    placeholder="Search for people or companies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearchApollo()}
                  />
                  <Button onClick={handleSearchApollo} disabled={loading}>
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                  </Button>
                </div>

                {searchResults.length > 0 && (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-muted-foreground">
                        {searchResults.length} results found
                      </p>
                      <Button 
                        onClick={() => handleImportSelected(searchResults)}
                        disabled={importing}
                        variant="hero"
                        size="sm"
                      >
                        {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                        Import All ({searchResults.length})
                      </Button>
                    </div>
                    {searchResults.map((result, idx) => (
                      <div key={idx} className="border rounded-lg p-3 space-y-1">
                        <div className="font-semibold">
                          {result.name || `${result.first_name} ${result.last_name}`}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {result.title && <div>{result.title}</div>}
                          {result.organization?.name && <div>{result.organization.name}</div>}
                          {result.email && <div>{result.email}</div>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">Apollo.io</h4>
                      <p className="text-sm text-muted-foreground">
                        Import leads directly from Apollo
                      </p>
                    </div>
                    {getIntegrationStatus('apollo') ? (
                      <Button 
                        variant="outline"
                        onClick={() => setSelectedIntegration('apollo')}
                      >
                        Import
                      </Button>
                    ) : (
                      <Button 
                        variant="outline"
                        onClick={() => {
                          navigate('/dashboard/integrations');
                          setOpen(false);
                        }}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                    )}
                  </div>
                </div>

                <div className="border rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold">Crunchbase</h4>
                      <p className="text-sm text-muted-foreground">
                        Import company data from Crunchbase
                      </p>
                    </div>
                    {getIntegrationStatus('crunchbase') ? (
                      <Button 
                        variant="outline"
                        onClick={() => setSelectedIntegration('crunchbase')}
                      >
                        Import
                      </Button>
                    ) : (
                      <Button 
                        variant="outline"
                        onClick={() => {
                          navigate('/dashboard/integrations');
                          setOpen(false);
                        }}
                      >
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                    )}
                  </div>
                </div>

                {integrations.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Configure your integrations in Settings to import leads directly from Apollo or Crunchbase.
                  </p>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
