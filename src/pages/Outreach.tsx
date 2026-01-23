import { useState, useEffect, useCallback } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Sparkles, CalendarPlus, Settings2, Image, Upload, Wand2, Mail, FileText, Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DOMPurify from "dompurify";
import { SentEmailsTable } from "@/components/outreach/SentEmailsTable";
import { EmailDraftsTable } from "@/components/outreach/EmailDraftsTable";
import { Badge } from "@/components/ui/badge";
import { debounce } from "@/lib/utils";

// Opener words for the cold email framework
const OPENER_WORDS = [
  { value: "saw", label: "Saw", example: "Saw you recently raised..." },
  { value: "noticed", label: "Noticed", example: "Noticed you just expanded..." },
  { value: "you", label: "You", example: "You recently hired..." },
  { value: "how", label: "How", example: "How are you handling..." },
  { value: "spoke", label: "Spoke", example: "Spoke to [name] and..." },
  { value: "referred", label: "Referred", example: "Referred by [name]..." },
  { value: "remember", label: "Remember", example: "Remember when we met..." },
];

interface EmailDraft {
  id: string;
  subject: string | null;
  body: string | null;
  tone: string | null;
  trigger_context: string | null;
  opener_word: string | null;
  lead_id: string | null;
  updated_at: string;
  leads?: { contact_name: string; company_name: string } | null;
}

const Outreach = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("compose");
  const [leads, setLeads] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState("");
  const [emailTone, setEmailTone] = useState("professional");
  const [openerWord, setOpenerWord] = useState("");
  const [triggerContext, setTriggerContext] = useState("");
  const [socialProof, setSocialProof] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [isGeneratingSubject, setIsGeneratingSubject] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [signature, setSignature] = useState("");
  const [signatureDialogOpen, setSignatureDialogOpen] = useState(false);
  const [isSavingSignature, setIsSavingSignature] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);
  const [draftsCount, setDraftsCount] = useState(0);

  useEffect(() => {
    loadLeads();
    loadSignature();
    loadSocialProof();
    loadCounts();
  }, []);

  const loadCounts = async () => {
    const [sentResult, draftsResult] = await Promise.all([
      supabase.from('sent_emails').select('id', { count: 'exact', head: true }),
      supabase.from('email_drafts').select('id', { count: 'exact', head: true }),
    ]);
    setSentCount(sentResult.count || 0);
    setDraftsCount(draftsResult.count || 0);
  };

  const loadLeads = async () => {
    const { data } = await supabase.from("leads").select("*");
    if (data) setLeads(data);
  };

  const loadSignature = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("email_signature")
      .eq("id", user.id)
      .single();
    
    if (data?.email_signature) {
      setSignature(data.email_signature);
    }
  };

  const loadSocialProof = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("social_proof")
      .eq("id", user.id)
      .single();
    
    if (data?.social_proof) {
      setSocialProof(data.social_proof);
    }
  };

  const saveSocialProof = async (value: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase
      .from("profiles")
      .update({ social_proof: value })
      .eq("id", user.id);
  };

  // Debounced social proof save
  const debouncedSaveSocialProof = useCallback(
    debounce((value: string) => saveSocialProof(value), 1000),
    []
  );

  const handleSocialProofChange = (value: string) => {
    setSocialProof(value);
    debouncedSaveSocialProof(value);
  };

  const saveSignature = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsSavingSignature(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ email_signature: signature })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Signature saved",
        description: "Your email signature has been updated",
      });
      setSignatureDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error saving signature",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingSignature(false);
    }
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (PNG, JPG, etc.)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 2MB",
        variant: "destructive",
      });
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsUploadingLogo(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}/logo-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('signature-logos')
        .upload(fileName, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('signature-logos')
        .getPublicUrl(fileName);

      const imgHtml = `<img src="${publicUrl}" alt="Logo" width="150" style="max-width: 150px;" />`;
      setSignature(prev => prev ? `${prev}\n${imgHtml}` : imgHtml);

      toast({
        title: "Logo uploaded",
        description: "Your logo has been added to the signature",
      });
    } catch (error: any) {
      toast({
        title: "Error uploading logo",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsUploadingLogo(false);
      event.target.value = '';
    }
  };

  const saveDraft = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsSavingDraft(true);
    try {
      const draftData = {
        user_id: user.id,
        lead_id: selectedLead || null,
        subject: subjectLine || null,
        body: generatedEmail || null,
        tone: emailTone,
        trigger_context: triggerContext || null,
        opener_word: openerWord || null,
        updated_at: new Date().toISOString(),
      };

      if (currentDraftId) {
        const { error } = await supabase
          .from('email_drafts')
          .update(draftData)
          .eq('id', currentDraftId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('email_drafts')
          .insert(draftData)
          .select()
          .single();
        if (error) throw error;
        setCurrentDraftId(data.id);
      }

      toast({
        title: "Draft saved",
        description: "Your email draft has been saved",
      });
      loadCounts();
    } catch (error: any) {
      toast({
        title: "Error saving draft",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const loadDraft = (draft: EmailDraft) => {
    setCurrentDraftId(draft.id);
    setSelectedLead(draft.lead_id || "");
    setSubjectLine(draft.subject || "");
    setGeneratedEmail(draft.body || "");
    setEmailTone(draft.tone || "professional");
    setTriggerContext(draft.trigger_context || "");
    setOpenerWord(draft.opener_word || "");
    setActiveTab("compose");
    toast({
      title: "Draft loaded",
      description: "Your draft has been loaded into the composer",
    });
  };

  const generateSubjectLine = async () => {
    if (!selectedLead) {
      toast({
        title: "Select a lead first",
        description: "Please select a lead to generate a subject line",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSubject(true);
    try {
      const lead = leads.find((l) => l.id === selectedLead);
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          lead,
          tone: emailTone,
          goal: "subject_only",
          triggerContext,
          openerWord,
        },
      });

      if (error) throw error;
      setSubjectLine(data.email.replace(/^Subject:\s*/i, '').trim());
      toast({
        title: "Subject line generated",
        description: "AI has created a subject line for you",
      });
    } catch (error: any) {
      toast({
        title: "Error generating subject",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSubject(false);
    }
  };

  const generateEmail = async () => {
    if (!selectedLead || !subjectLine) {
      toast({
        title: "Missing information",
        description: "Please select a lead and add a subject line",
        variant: "destructive",
      });
      return;
    }

    if (subjectLine.length > 200) {
      toast({
        title: "Invalid input",
        description: "Subject line must be less than 200 characters",
        variant: "destructive",
      });
      return;
    }

    const allowedTones = ["professional", "friendly", "casual", "formal"];
    if (!allowedTones.includes(emailTone)) {
      toast({
        title: "Invalid input",
        description: "Invalid email tone selected",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    try {
      const lead = leads.find((l) => l.id === selectedLead);
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          lead,
          tone: emailTone,
          goal: "custom",
          subjectLine,
          triggerContext,
          openerWord,
          socialProof,
        },
      });

      if (error) throw error;
      setGeneratedEmail(data.email);
      toast({
        title: "Email generated",
        description: "AI has created a personalized cold email for you",
      });
    } catch (error: any) {
      toast({
        title: "Error generating email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const sendEmail = async () => {
    if (!selectedLead || !generatedEmail) {
      toast({
        title: "Missing information",
        description: "Please generate an email first",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);
    try {
      const lead = leads.find((l) => l.id === selectedLead);
      
      if (!lead.contact_email) {
        throw new Error('Lead does not have an email address');
      }

      const { data: integrations } = await supabase
        .from('integrations')
        .select('integration_id')
        .eq('is_active', true)
        .eq('integration_id', 'google');

      if (!integrations || integrations.length === 0) {
        toast({
          title: "Google not connected",
          description: "Please connect Google in the Integrations page first.",
          variant: "destructive",
        });
        setIsSending(false);
        return;
      }

      const integrationId = integrations[0].integration_id;

      const fullEmailBody = signature 
        ? `${generatedEmail}\n\n${signature}`
        : generatedEmail;

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: lead.contact_email,
          subject: subjectLine,
          body: fullEmailBody,
          integrationId,
          leadId: selectedLead,
        }
      });

      if (error) throw error;
      
      toast({
        title: "Email sent!",
        description: `Email sent to ${lead.contact_name} at ${lead.contact_email}`,
      });
      
      // Clear form and delete draft if exists
      if (currentDraftId) {
        await supabase.from('email_drafts').delete().eq('id', currentDraftId);
        setCurrentDraftId(null);
      }
      setGeneratedEmail("");
      setSelectedLead("");
      setSubjectLine("");
      setTriggerContext("");
      setOpenerWord("");
      loadCounts();
    } catch (error: any) {
      toast({
        title: "Error sending email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  const sendToCalendar = async () => {
    if (!selectedLead) {
      toast({
        title: "Missing information",
        description: "Please select a lead first",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const lead = leads.find((l) => l.id === selectedLead);
      
      const { error } = await supabase.from("activities").insert({
        subject: `Meeting with ${lead.contact_name}`,
        type: "meeting",
        lead_id: selectedLead,
        user_id: user.id,
        description: `Follow-up meeting scheduled via email`,
      });

      if (error) throw error;

      toast({
        title: "Added to calendar",
        description: "Meeting has been added to your calendar",
      });
    } catch (error: any) {
      toast({
        title: "Error adding to calendar",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const clearForm = () => {
    setCurrentDraftId(null);
    setSelectedLead("");
    setSubjectLine("");
    setGeneratedEmail("");
    setTriggerContext("");
    setOpenerWord("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Outreach Studio</h1>
            <p className="text-muted-foreground">
              Generate AI-powered cold emails using proven frameworks
            </p>
          </div>
          <Dialog open={signatureDialogOpen} onOpenChange={setSignatureDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="w-4 h-4 mr-2" />
                {signature ? "Edit Signature" : "Add Signature"}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Email Signature</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Your Signature (supports HTML for logos/images)</Label>
                  <Textarea
                    value={signature}
                    onChange={(e) => setSignature(e.target.value)}
                    placeholder={`Best regards,
John Doe
Sales Director | Company Name
📧 john@company.com | 📞 (555) 123-4567
🌐 www.company.com

For logos, use HTML:
<img src="https://your-logo-url.com/logo.png" alt="Company Logo" width="150" />`}
                    className="min-h-[200px] font-mono text-sm"
                  />
                </div>
                <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground flex items-center gap-2">
                      <Image className="w-4 h-4" />
                      Upload your logo or company image
                    </p>
                  </div>
                  <div>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                      className="hidden"
                      id="logo-upload"
                      disabled={isUploadingLogo}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('logo-upload')?.click()}
                      disabled={isUploadingLogo}
                    >
                      {isUploadingLogo ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Logo
                        </>
                      )}
                    </Button>
                  </div>
                </div>
                {signature && (
                  <div>
                    <Label className="text-muted-foreground">Preview</Label>
                    <div 
                      className="mt-2 p-4 border rounded-lg bg-background prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signature.replace(/\n/g, '<br/>')) }}
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setSignatureDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={saveSignature} disabled={isSavingSignature}>
                    {isSavingSignature ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      "Save Signature"
                    )}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="sent" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Sent
              {sentCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{sentCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="drafts" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Drafts
              {draftsCount > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs">{draftsCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Email Configuration</h2>
                  {currentDraftId && (
                    <Button variant="ghost" size="sm" onClick={clearForm}>
                      New Email
                    </Button>
                  )}
                </div>
                <div className="space-y-4">
                  <div>
                    <Label>Select Lead</Label>
                    <Select value={selectedLead} onValueChange={setSelectedLead}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a lead" />
                      </SelectTrigger>
                      <SelectContent>
                        {leads.map((lead) => (
                          <SelectItem key={lead.id} value={lead.id}>
                            {lead.contact_name} - {lead.company_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Email Tone</Label>
                      <Select value={emailTone} onValueChange={setEmailTone}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="professional">Professional</SelectItem>
                          <SelectItem value="friendly">Friendly</SelectItem>
                          <SelectItem value="casual">Casual</SelectItem>
                          <SelectItem value="formal">Formal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label>
                        Opening Word
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="ml-1 text-muted-foreground cursor-help">ⓘ</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p>Start your email with one of these 7 proven words for higher response rates</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </Label>
                      <Select value={openerWord} onValueChange={setOpenerWord}>
                        <SelectTrigger>
                          <SelectValue placeholder="Auto-select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">Auto-select</SelectItem>
                          {OPENER_WORDS.map((word) => (
                            <SelectItem key={word.value} value={word.value}>
                              {word.label} - {word.example}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label>
                      Trigger/Context
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1 text-muted-foreground cursor-help">ⓘ</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Add personalized context like recent funding, job change, company news, or mutual connections</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Input
                      value={triggerContext}
                      onChange={(e) => setTriggerContext(e.target.value)}
                      placeholder="e.g., Saw you just raised Series A from Accel..."
                      maxLength={300}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      This becomes your personalized email opener
                    </p>
                  </div>

                  <div>
                    <Label>
                      Social Proof
                      <Badge variant="outline" className="ml-2 text-xs">Saved</Badge>
                    </Label>
                    <Textarea
                      value={socialProof}
                      onChange={(e) => handleSocialProofChange(e.target.value)}
                      placeholder="e.g., Spot and Ignite are customers of ours. We helped them cut board prep time by 50%..."
                      className="min-h-[80px]"
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Customer references and results to include in emails
                    </p>
                  </div>

                  <div>
                    <Label>Subject Line</Label>
                    <div className="flex gap-2">
                      <Input
                        value={subjectLine}
                        onChange={(e) => setSubjectLine(e.target.value)}
                        placeholder="Enter subject line or generate one..."
                        className="flex-1"
                        maxLength={200}
                      />
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={generateSubjectLine}
                              disabled={isGeneratingSubject || !selectedLead}
                            >
                              {isGeneratingSubject ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Wand2 className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Generate subject line with AI</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={generateEmail}
                      disabled={isGenerating}
                      className="flex-1"
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 mr-2" />
                          Generate Email
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={saveDraft}
                      disabled={isSavingDraft || (!selectedLead && !subjectLine && !generatedEmail)}
                    >
                      {isSavingDraft ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Generated Email</h2>
                {generatedEmail ? (
                  <div className="space-y-4">
                    <div className="bg-muted/30 p-3 rounded-lg border mb-2">
                      <p className="text-sm">
                        <span className="text-muted-foreground">To:</span>{" "}
                        {leads.find(l => l.id === selectedLead)?.contact_email || "Select a lead"}
                      </p>
                      <p className="text-sm">
                        <span className="text-muted-foreground">Subject:</span>{" "}
                        {subjectLine || "Add a subject line"}
                      </p>
                    </div>
                    <Textarea
                      value={generatedEmail}
                      onChange={(e) => setGeneratedEmail(e.target.value)}
                      className="min-h-[280px]"
                    />
                    <div className="flex gap-2">
                      <Button 
                        className="flex-1"
                        onClick={sendEmail}
                        disabled={isSending}
                      >
                        {isSending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send Email
                          </>
                        )}
                      </Button>
                      {subjectLine.toLowerCase().includes("meeting") && (
                        <Button 
                          variant="outline"
                          onClick={sendToCalendar}
                        >
                          <CalendarPlus className="w-4 h-4 mr-2" />
                          Add to Calendar
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-[300px] text-muted-foreground">
                    <Sparkles className="w-12 h-12 mb-4 opacity-20" />
                    <p>Generate an email to see it here</p>
                    <p className="text-sm mt-2 text-center max-w-xs">
                      Using the 4-sentence cold email framework with proven opener words
                    </p>
                  </div>
                )}
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sent" className="mt-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Sent Emails</h2>
              <SentEmailsTable />
            </Card>
          </TabsContent>

          <TabsContent value="drafts" className="mt-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Email Drafts</h2>
              <EmailDraftsTable onLoadDraft={loadDraft} />
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Outreach;
