import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface ImportLeadsDialogProps {
  onImportComplete?: () => void;
}

export const ImportLeadsDialog = ({ onImportComplete }: ImportLeadsDialogProps) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [source, setSource] = useState<string>("");
  const { toast } = useToast();

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

  const downloadTemplate = () => {
    const csv = "Company Name,Contact Name,Email,Phone,Industry,Company Size,Source\nExample Corp,John Doe,john@example.com,555-0100,Technology,50-200,Website";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "leads_template.csv";
    a.click();
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
            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold">Apollo.io</h4>
                    <p className="text-sm text-muted-foreground">
                      Import leads directly from Apollo
                    </p>
                  </div>
                  <Button variant="outline" disabled>
                    Connect
                  </Button>
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
                  <Button variant="outline" disabled>
                    Connect
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground text-center py-4">
                Integration connections coming soon. For now, export from your platform and use CSV import.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
