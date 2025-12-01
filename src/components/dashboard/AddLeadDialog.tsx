import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles } from "lucide-react";

interface AddLeadDialogProps {
  onLeadAdded?: () => void;
}

export const AddLeadDialog = ({ onLeadAdded }: AddLeadDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [scoring, setScoring] = useState(false);
  
  const [formData, setFormData] = useState({
    companyName: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    industry: "",
    companySize: "",
    source: "",
    notes: "",
  });

  const [aiScore, setAiScore] = useState<{
    score: number;
    reasoning: string;
    recommendations: string[];
  } | null>(null);

  const handleScoreLead = async () => {
    if (!formData.companyName || !formData.contactName) {
      toast({
        title: "Missing information",
        description: "Please enter company and contact name first",
        variant: "destructive",
      });
      return;
    }

    setScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('score-lead', {
        body: formData
      });

      if (error) throw error;

      setAiScore(data);
      toast({
        title: "Lead scored!",
        description: `ICP Score: ${data.score}/100`,
      });
    } catch (error: any) {
      toast({
        title: "Scoring failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setScoring(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Check authentication first
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Validate inputs
      if (!formData.companyName.trim() || formData.companyName.length > 100) {
        throw new Error("Company name is required and must be less than 100 characters");
      }
      if (!formData.contactName.trim() || formData.contactName.length > 100) {
        throw new Error("Contact name is required and must be less than 100 characters");
      }
      if (formData.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.contactEmail)) {
        throw new Error("Invalid email format");
      }
      if (formData.contactEmail && formData.contactEmail.length > 255) {
        throw new Error("Email must be less than 255 characters");
      }
      if (formData.notes && formData.notes.length > 2000) {
        throw new Error("Notes must be less than 2000 characters");
      }

      setLoading(true);

      const { data: newLead, error } = await supabase.from("leads").insert({
        user_id: user.id,
        company_name: formData.companyName,
        contact_name: formData.contactName,
        contact_email: formData.contactEmail || null,
        contact_phone: formData.contactPhone || null,
        industry: formData.industry || null,
        company_size: formData.companySize || null,
        source: formData.source || null,
        notes: formData.notes || null,
        icp_score: aiScore?.score || 0,
      }).select().single();

      if (error) throw error;

      // Auto-enrich the lead (don't wait for it to complete)
      if (newLead) {
        supabase.functions.invoke('enrich-lead', {
          body: { leadId: newLead.id }
        }).catch((enrichError) => {
          console.error('Auto-enrichment failed:', enrichError);
        });
      }

      toast({
        title: "Lead added!",
        description: "The lead has been successfully added to your database.",
      });

      setFormData({
        companyName: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
        industry: "",
        companySize: "",
        source: "",
        notes: "",
      });
      setAiScore(null);
      setOpen(false);
      onLeadAdded?.();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="hero">
          <Sparkles className="w-4 h-4 mr-2" />
          Add Lead
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add New Lead</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">Company Name *</Label>
              <Input
                id="companyName"
                value={formData.companyName}
                onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactName">Contact Name *</Label>
              <Input
                id="contactName"
                value={formData.contactName}
                onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactEmail">Email</Label>
              <Input
                id="contactEmail"
                type="email"
                value={formData.contactEmail}
                onChange={(e) => setFormData({ ...formData, contactEmail: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="contactPhone">Phone</Label>
              <Input
                id="contactPhone"
                value={formData.contactPhone}
                onChange={(e) => setFormData({ ...formData, contactPhone: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="industry">Industry</Label>
              <Select
                value={formData.industry}
                onValueChange={(value) => setFormData({ ...formData, industry: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="saas">SaaS</SelectItem>
                  <SelectItem value="fintech">Fintech</SelectItem>
                  <SelectItem value="ecommerce">E-commerce</SelectItem>
                  <SelectItem value="healthcare">Healthcare</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="companySize">Company Size</Label>
              <Select
                value={formData.companySize}
                onValueChange={(value) => setFormData({ ...formData, companySize: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1-10</SelectItem>
                  <SelectItem value="11-50">11-50</SelectItem>
                  <SelectItem value="51-200">51-200</SelectItem>
                  <SelectItem value="201-500">201-500</SelectItem>
                  <SelectItem value="500+">500+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="source">Source</Label>
            <Input
              id="source"
              value={formData.source}
              onChange={(e) => setFormData({ ...formData, source: e.target.value })}
              placeholder="LinkedIn, referral, cold outreach..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          {/* AI Scoring Section */}
          <div className="border border-primary/20 rounded-lg p-4 bg-primary/5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <span className="font-semibold">AI Lead Scoring</span>
              </div>
              <Button
                type="button"
                variant="glass"
                size="sm"
                onClick={handleScoreLead}
                disabled={scoring}
              >
                {scoring && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Score Lead
              </Button>
            </div>

            {aiScore && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="text-3xl font-bold text-primary">{aiScore.score}/100</div>
                  <div className="flex-1 text-sm text-muted-foreground">{aiScore.reasoning}</div>
                </div>
                {aiScore.recommendations.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-1">Recommendations:</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      {aiScore.recommendations.map((rec, idx) => (
                        <li key={idx}>• {rec}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="hero" disabled={loading} className="flex-1">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Add Lead
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
