import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Upload, Download, Loader2, ExternalLink, Clock, History, Settings2, Calendar } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";

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
  const [importHistory, setImportHistory] = useState<any[]>([]);
  const [scheduledImports, setScheduledImports] = useState<any[]>([]);
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());
  const [showFieldMapping, setShowFieldMapping] = useState(false);
  const [fieldMappings, setFieldMappings] = useState<Record<string, string>>({});
  const [scheduleFrequency, setScheduleFrequency] = useState<'daily' | 'weekly'>('daily');
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      fetchIntegrations();
      fetchImportHistory();
      fetchScheduledImports();
    }
  }, [open]);

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

      const { data, error } = await supabase.from("leads").insert(leads).select();
      if (error) throw error;

      // Log import history
      await supabase.from("import_history").insert({
        user_id: session.user.id,
        source: source || 'CSV',
        leads_count: leads.length,
        success_count: data?.length || 0,
        failed_count: leads.length - (data?.length || 0),
        import_type: 'manual'
      });

      toast({
        title: "Import successful",
        description: `Imported ${data?.length || 0} leads from CSV`,
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

  const fetchIntegrations = async () => {
    try {
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .eq('is_active', true)
        .in('integration_id', ['external_provider']);

      if (error) throw error;
      setIntegrations(data || []);
    } catch (error) {
      console.error('Error fetching integrations:', error);
    }
  };

  const fetchImportHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('import_history')
        .select('*')
        .order('imported_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setImportHistory(data || []);
    } catch (error) {
      console.error('Error fetching import history:', error);
    }
  };

  const fetchScheduledImports = async () => {
    try {
      const { data, error } = await supabase
        .from('scheduled_imports')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setScheduledImports(data || []);
    } catch (error) {
      console.error('Error fetching scheduled imports:', error);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setLoading(true);
    try {
      // Search functionality now uses SalesOS Lead Intelligence Network
      toast({
        title: "Use Lead Finder",
        description: "Search for leads using the main Leads page search functionality",
      });
      setSearchResults([]);
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

  const formatLeadData = (lead: any) => {
    const formatted: any = {};
    
    // Apply field mappings or use defaults
    if (fieldMappings.company_name) {
      formatted.company_name = lead[fieldMappings.company_name] || 'Unknown Company';
    } else {
      formatted.company_name = lead.organization?.name || lead.company || lead.name || 'Unknown Company';
    }

    if (fieldMappings.contact_name) {
      formatted.contact_name = lead[fieldMappings.contact_name] || 'Unknown Contact';
    } else {
      formatted.contact_name = lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown Contact';
    }

    formatted.contact_email = lead[fieldMappings.contact_email || 'email'] || null;
    formatted.contact_phone = lead[fieldMappings.contact_phone || 'phone_numbers']?.[0]?.sanitized_number || null;
    formatted.industry = lead[fieldMappings.industry] || lead.organization?.industry || lead.industry || null;
    formatted.job_title = lead[fieldMappings.job_title || 'title'] || null;
    formatted.linkedin_url = lead[fieldMappings.linkedin_url || 'linkedin_url'] || null;
    formatted.company_website = lead[fieldMappings.company_website] || lead.organization?.website_url || lead.website || null;
    formatted.source = 'External Data Provider';

    return formatted;
  };

  const handleImportSelected = async () => {
    setImporting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const leadsToImport = Array.from(selectedLeads).map(idx => searchResults[idx]);
      const formattedLeads = leadsToImport.map(lead => ({
        ...formatLeadData(lead),
        user_id: session.user.id
      }));

      const { data, error } = await supabase.from("leads").insert(formattedLeads).select();
      if (error) throw error;

      // Log import history
      await supabase.from("import_history").insert({
        user_id: session.user.id,
        source: 'External Data Provider',
        leads_count: formattedLeads.length,
        success_count: data?.length || 0,
        failed_count: formattedLeads.length - (data?.length || 0),
        import_type: 'manual',
        search_query: searchQuery,
        field_mappings: Object.keys(fieldMappings).length > 0 ? fieldMappings : null
      });

      toast({
        title: "Import successful",
        description: `Imported ${data?.length || 0} leads`,
      });

      setSearchResults([]);
      setSearchQuery("");
      setSelectedLeads(new Set());
      setSelectedIntegration(null);
      setFieldMappings({});
      setShowFieldMapping(false);
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

  const handleScheduleImport = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const now = new Date();
      let nextRun = new Date(now);
      
      if (scheduleFrequency === 'daily') {
        nextRun.setDate(nextRun.getDate() + 1);
      } else if (scheduleFrequency === 'weekly') {
        nextRun.setDate(nextRun.getDate() + 7);
      }

      const { error } = await supabase.from("scheduled_imports").insert({
        user_id: session.user.id,
        integration_id: selectedIntegration!,
        search_query: searchQuery,
        field_mappings: Object.keys(fieldMappings).length > 0 ? fieldMappings : null,
        schedule_frequency: scheduleFrequency,
        next_run_at: nextRun.toISOString()
      });

      if (error) throw error;

      toast({
        title: "Schedule created",
        description: `Import will run ${scheduleFrequency} starting ${format(nextRun, 'PPp')}`,
      });

      fetchScheduledImports();
    } catch (error: any) {
      toast({
        title: "Failed to create schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleSchedule = async (scheduleId: string, isActive: boolean) => {
    try {
      const { error } = await supabase
        .from('scheduled_imports')
        .update({ is_active: !isActive })
        .eq('id', scheduleId);

      if (error) throw error;

      toast({
        title: isActive ? "Schedule paused" : "Schedule activated",
      });

      fetchScheduledImports();
    } catch (error: any) {
      toast({
        title: "Failed to update schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const deleteSchedule = async (scheduleId: string) => {
    try {
      const { error } = await supabase
        .from('scheduled_imports')
        .delete()
        .eq('id', scheduleId);

      if (error) throw error;

      toast({
        title: "Schedule deleted",
      });

      fetchScheduledImports();
    } catch (error: any) {
      toast({
        title: "Failed to delete schedule",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const toggleLeadSelection = (idx: number) => {
    const newSelected = new Set(selectedLeads);
    if (newSelected.has(idx)) {
      newSelected.delete(idx);
    } else {
      newSelected.add(idx);
    }
    setSelectedLeads(newSelected);
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
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Leads</DialogTitle>
          <DialogDescription>
            Upload leads from CSV or connect your integrations
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="csv">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="csv">CSV Upload</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="schedule">Scheduled</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          <TabsContent value="csv" className="space-y-4">
            <div>
              <Label htmlFor="source">Lead Source (Optional)</Label>
              <Select value={source} onValueChange={setSource}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SalesOS">SalesOS Lead Intelligence</SelectItem>
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
            <ScrollArea className="h-[500px] pr-4">
              {selectedIntegration ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Search External Providers</h4>
                    <Button variant="ghost" onClick={() => {
                      setSelectedIntegration(null);
                      setSearchResults([]);
                      setSearchQuery("");
                      setSelectedLeads(new Set());
                      setFieldMappings({});
                      setShowFieldMapping(false);
                    }}>
                      Back
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Input
                      placeholder="Search for people or companies..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                    <Button onClick={handleSearch} disabled={loading}>
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                    </Button>
                  </div>

                  {searchResults.length > 0 && (
                    <>
                      <div className="flex items-center justify-between">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowFieldMapping(!showFieldMapping)}
                        >
                          <Settings2 className="w-4 h-4 mr-2" />
                          Field Mapping
                        </Button>
                        <div className="flex gap-2">
                          <Button 
                            onClick={handleImportSelected}
                            disabled={importing || selectedLeads.size === 0}
                            variant="hero"
                            size="sm"
                          >
                            {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                            Import Selected ({selectedLeads.size})
                          </Button>
                          <Button 
                            onClick={handleScheduleImport}
                            disabled={!searchQuery}
                            variant="outline"
                            size="sm"
                          >
                            <Calendar className="w-4 h-4 mr-2" />
                            Schedule
                          </Button>
                        </div>
                      </div>

                      {showFieldMapping && (
                        <Card className="p-4 space-y-3">
                          <h5 className="font-semibold text-sm">Custom Field Mapping</h5>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Company Name Field</Label>
                              <Input
                                placeholder="e.g., organization.name"
                                value={fieldMappings.company_name || ''}
                                onChange={(e) => setFieldMappings({...fieldMappings, company_name: e.target.value})}
                                size={1}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Contact Name Field</Label>
                              <Input
                                placeholder="e.g., name"
                                value={fieldMappings.contact_name || ''}
                                onChange={(e) => setFieldMappings({...fieldMappings, contact_name: e.target.value})}
                                size={1}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Email Field</Label>
                              <Input
                                placeholder="e.g., email"
                                value={fieldMappings.contact_email || ''}
                                onChange={(e) => setFieldMappings({...fieldMappings, contact_email: e.target.value})}
                                size={1}
                              />
                            </div>
                            <div>
                              <Label className="text-xs">Phone Field</Label>
                              <Input
                                placeholder="e.g., phone"
                                value={fieldMappings.contact_phone || ''}
                                onChange={(e) => setFieldMappings({...fieldMappings, contact_phone: e.target.value})}
                                size={1}
                              />
                            </div>
                          </div>
                        </Card>
                      )}

                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          {searchResults.length} results found - Select leads to import
                        </p>
                        {searchResults.map((result, idx) => (
                          <Card key={idx} className="p-3 cursor-pointer hover:bg-muted/50" onClick={() => toggleLeadSelection(idx)}>
                            <div className="flex items-start gap-3">
                              <Checkbox
                                checked={selectedLeads.has(idx)}
                                onCheckedChange={() => toggleLeadSelection(idx)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1">
                                <div className="font-semibold">
                                  {result.name || `${result.first_name} ${result.last_name}` || result.identifier?.value}
                                </div>
                                <div className="text-sm text-muted-foreground space-y-1">
                                  {result.title && <div>{result.title}</div>}
                                  {(result.organization?.name || result.company) && <div>{result.organization?.name || result.company}</div>}
                                  {result.email && <div>{result.email}</div>}
                                  {result.short_description && <div className="text-xs">{result.short_description}</div>}
                                </div>
                              </div>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground text-center py-8">
                    Use CSV upload or the SalesOS Lead Intelligence Network to import leads.
                  </p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="schedule" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              {scheduledImports.length > 0 ? (
                <div className="space-y-3">
                  {scheduledImports.map((schedule) => (
                    <Card key={schedule.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold capitalize">{schedule.integration_id}</h4>
                            {schedule.is_active ? (
                              <span className="text-xs bg-green-500/10 text-green-500 px-2 py-0.5 rounded">Active</span>
                            ) : (
                              <span className="text-xs bg-gray-500/10 text-gray-500 px-2 py-0.5 rounded">Paused</span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Query: {schedule.search_query}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Runs {schedule.schedule_frequency} • Next: {format(new Date(schedule.next_run_at), 'PPp')}
                          </p>
                          {schedule.last_run_at && (
                            <p className="text-xs text-muted-foreground">
                              Last: {format(new Date(schedule.last_run_at), 'PPp')}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => toggleSchedule(schedule.id, schedule.is_active)}
                          >
                            <Clock className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteSchedule(schedule.id)}
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No scheduled imports yet</p>
                  <p className="text-sm mt-2">Create a search in the Integrations tab and click Schedule</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="history" className="space-y-4">
            <ScrollArea className="h-[500px] pr-4">
              {importHistory.length > 0 ? (
                <div className="space-y-3">
                  {importHistory.map((entry) => (
                    <Card key={entry.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <h4 className="font-semibold">{entry.source}</h4>
                            <span className="text-xs bg-blue-500/10 text-blue-500 px-2 py-0.5 rounded capitalize">
                              {entry.import_type}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {entry.success_count} successful, {entry.failed_count} failed
                          </p>
                          {entry.search_query && (
                            <p className="text-xs text-muted-foreground">
                              Query: {entry.search_query}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(entry.imported_at), 'PPp')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">{entry.leads_count}</p>
                          <p className="text-xs text-muted-foreground">leads</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No import history yet</p>
                  <p className="text-sm mt-2">Your import history will appear here</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>
        </Tabs>

        {selectedIntegration && searchQuery && (
          <Card className="p-3 bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Label className="text-sm">Schedule Frequency:</Label>
                <Select value={scheduleFrequency} onValueChange={(v: any) => setScheduleFrequency(v)}>
                  <SelectTrigger className="w-32 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        )}
      </DialogContent>
    </Dialog>
  );
};