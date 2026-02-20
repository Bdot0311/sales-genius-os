import { useState, useEffect, useCallback, useRef } from "react";
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
import { Loader2, Send, Sparkles, CalendarPlus, Settings2, Image, Upload, Wand2, Mail, FileText, Save, Shuffle, Check, X, Keyboard, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import DOMPurify from "dompurify";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { SentEmailsTable } from "@/components/outreach/SentEmailsTable";
import { EmailDraftsTable } from "@/components/outreach/EmailDraftsTable";
import { Badge } from "@/components/ui/badge";
import { debounce } from "@/lib/utils";
import { EmailTemplateManager, UserEmailTemplate } from "@/components/outreach/EmailTemplateManager";
import { EmailPerformanceStats } from "@/components/outreach/EmailPerformanceStats";
import { FollowUpSuggestion, FollowUpData } from "@/components/outreach/FollowUpSuggestion";
import { BarChart3 } from "lucide-react";

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

// Email templates for quick selection
const EMAIL_TEMPLATES = [
  { 
    value: "meeting_request", 
    label: "Meeting Request", 
    description: "Request a quick call or meeting",
    goal: "meeting",
    suggestedSubject: "Quick question about {company}"
  },
  { 
    value: "demo_invite", 
    label: "Demo Invite", 
    description: "Invite to see a product demo",
    goal: "demo",
    suggestedSubject: "15-min demo for {company}?"
  },
  { 
    value: "follow_up", 
    label: "Follow-up", 
    description: "Follow up on previous outreach",
    goal: "follow-up",
    suggestedSubject: "Following up, {name}"
  },
  { 
    value: "introduction", 
    label: "Cold Introduction", 
    description: "First contact introduction",
    goal: "introduction",
    suggestedSubject: "Idea for {company}"
  },
  { 
    value: "proposal", 
    label: "Proposal", 
    description: "Send a proposal or offer",
    goal: "proposal",
    suggestedSubject: "Proposal for {company}"
  },
];

interface EmailVariant {
  id: string;
  subject: string;
  body: string;
}

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
  const [isGeneratingTrigger, setIsGeneratingTrigger] = useState(false);
  const [isGeneratingSocialProof, setIsGeneratingSocialProof] = useState(false);
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
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [emailVariants, setEmailVariants] = useState<EmailVariant[]>([]);
  const [isGeneratingVariants, setIsGeneratingVariants] = useState(false);
  const [showVariantPicker, setShowVariantPicker] = useState(false);
  const [currentTemplateId, setCurrentTemplateId] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(true);
  const [showFollowUpSuggestion, setShowFollowUpSuggestion] = useState(false);
  const [lastSentEmailInfo, setLastSentEmailInfo] = useState<{
    leadId: string;
    leadName: string;
    leadEmail: string;
    companyName: string;
    subject: string;
  } | null>(null);
  
  // Multi-sender state
  const [connectedAccounts, setConnectedAccounts] = useState<Array<{ id: string; email: string }>>([]);
  const [selectedSenderId, setSelectedSenderId] = useState("");
  
  // Schedule state
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);

  useEffect(() => {
    loadLeads();
    loadSignature();
    loadSocialProof();
    loadCounts();
    loadConnectedAccounts();
  }, []);

  const loadConnectedAccounts = async () => {
    const { data } = await supabase
      .from('integrations')
      .select('id, connected_email, config')
      .eq('integration_id', 'google')
      .eq('is_active', true);
    
    if (data && data.length > 0) {
      const accounts = data.map(row => ({
        id: row.id,
        email: row.connected_email || (row.config as any)?.googleEmail || 'Unknown account',
      }));
      setConnectedAccounts(accounts);
      // Auto-select first account if none selected
      if (!selectedSenderId && accounts.length > 0) {
        setSelectedSenderId(accounts[0].id);
      }
    }
  };

  // Keyboard shortcuts: Ctrl+G to generate, Ctrl+Enter to send
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only trigger when on compose tab and not in a text input that needs these keys

      // Ctrl+G to generate email
      if (activeTab === "compose" && e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        if (!isGenerating && selectedLead) {
          generateEmail();
        }
      }

      // Ctrl+Enter to send email
      if (activeTab === "compose" && e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (!isSending && selectedLead && generatedEmail) {
          sendEmail();
        }
      }

      // Ctrl+S to save draft
      if (activeTab === "compose" && e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (!isSavingDraft && (selectedLead || subjectLine || generatedEmail)) {
          saveDraft();
        }
      }

      // Ctrl+D to switch to drafts tab
      if (e.ctrlKey && e.key === 'd') {
        e.preventDefault();
        setActiveTab("drafts");
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab, isGenerating, isSending, selectedLead, generatedEmail, isSavingDraft, subjectLine]);

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
          openerWord: openerWord === "auto" ? "" : openerWord,
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

  const generateTriggerContext = async () => {
    if (!selectedLead) {
      toast({
        title: "Select a lead first",
        description: "Please select a lead to generate trigger context",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingTrigger(true);
    try {
      const lead = leads.find((l) => l.id === selectedLead);
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          lead,
          tone: emailTone,
          goal: "trigger_context",
          openerWord: openerWord === "auto" ? "" : openerWord,
        },
      });

      if (error) throw error;
      setTriggerContext(data.email.trim());
      toast({
        title: "Trigger context generated",
        description: "AI created a personalized opener for you",
      });
    } catch (error: any) {
      toast({
        title: "Error generating trigger",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingTrigger(false);
    }
  };

  const generateSocialProofText = async () => {
    if (!selectedLead) {
      toast({
        title: "Select a lead first",
        description: "Please select a lead to generate social proof",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingSocialProof(true);
    try {
      const lead = leads.find((l) => l.id === selectedLead);
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          lead,
          tone: emailTone,
          goal: "social_proof",
        },
      });

      if (error) throw error;
      const newProof = data.email.trim();
      setSocialProof(newProof);
      saveSocialProof(newProof);
      toast({
        title: "Social proof generated",
        description: "AI created social proof text for you",
      });
    } catch (error: any) {
      toast({
        title: "Error generating social proof",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsGeneratingSocialProof(false);
    }
  };

  const generateEmail = async () => {
    if (!selectedLead) {
      toast({
        title: "Missing information",
        description: "Please select a lead to generate a personalized email",
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
      
      // If no subject line, generate one first
      let finalSubjectLine = subjectLine;
      if (!finalSubjectLine) {
        const { data: subjectData, error: subjectError } = await supabase.functions.invoke("generate-email", {
          body: {
            lead,
            tone: emailTone,
            goal: "subject_only",
            triggerContext,
            openerWord: openerWord === "auto" ? "" : openerWord,
          },
        });
        if (subjectError) throw subjectError;
        finalSubjectLine = subjectData.email.replace(/^Subject:\s*/i, '').trim();
        setSubjectLine(finalSubjectLine);
      }
      
      // Now generate the email body
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          lead,
          tone: emailTone,
          goal: "custom",
          subjectLine: finalSubjectLine,
          triggerContext,
          openerWord: openerWord === "auto" ? "" : openerWord,
          socialProof,
        },
      });

      if (error) throw error;
      setGeneratedEmail(data.email);
      toast({
        title: "Email generated",
        description: "AI created a personalized sales email designed to book meetings",
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

  const handleTemplateSelect = (templateValue: string) => {
    setSelectedTemplate(templateValue);
    const template = EMAIL_TEMPLATES.find(t => t.value === templateValue);
    if (template && selectedLead) {
      const lead = leads.find(l => l.id === selectedLead);
      if (lead) {
        const populatedSubject = template.suggestedSubject
          .replace('{company}', lead.company_name || 'your company')
          .replace('{name}', lead.contact_name?.split(' ')[0] || 'there');
        setSubjectLine(populatedSubject);
      }
    }
  };

  const generateABVariants = async () => {
    if (!selectedLead) {
      toast({
        title: "Select a lead first",
        description: "Please select a lead to generate email variants",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingVariants(true);
    setShowVariantPicker(true);
    setEmailVariants([]);

    try {
      const lead = leads.find((l) => l.id === selectedLead);
      const template = EMAIL_TEMPLATES.find(t => t.value === selectedTemplate);
      const goal = template?.goal || "introduction";

      // Generate 3 variants in parallel
      const variantPromises = [1, 2, 3].map(async (num) => {
        // Generate subject
        const { data: subjectData } = await supabase.functions.invoke("generate-email", {
          body: {
            lead,
            tone: emailTone,
            goal: "subject_only",
            triggerContext,
            openerWord: openerWord === "auto" ? "" : openerWord,
            variantNum: num,
          },
        });
        const subject = subjectData?.email?.replace(/^Subject:\s*/i, '').trim() || `Variant ${num}`;

        // Generate body
        const { data: bodyData } = await supabase.functions.invoke("generate-email", {
          body: {
            lead,
            tone: emailTone,
            goal,
            subjectLine: subject,
            triggerContext,
            openerWord: openerWord === "auto" ? "" : openerWord,
            socialProof,
            variantNum: num,
          },
        });

        return {
          id: `variant-${num}`,
          subject,
          body: bodyData?.email || '',
        };
      });

      const variants = await Promise.all(variantPromises);
      setEmailVariants(variants);

      toast({
        title: "Variants generated",
        description: "3 email variants ready for comparison",
      });
    } catch (error: any) {
      toast({
        title: "Error generating variants",
        description: error.message,
        variant: "destructive",
      });
      setShowVariantPicker(false);
    } finally {
      setIsGeneratingVariants(false);
    }
  };

  const selectVariant = (variant: EmailVariant) => {
    setSubjectLine(variant.subject);
    setGeneratedEmail(variant.body);
    setShowVariantPicker(false);
    setEmailVariants([]);
    toast({
      title: "Variant selected",
      description: "Email variant applied to composer",
    });
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

      if (connectedAccounts.length === 0) {
        toast({
          title: "No email accounts connected",
          description: "Please connect a Google account in the Integrations page first.",
          variant: "destructive",
        });
        setIsSending(false);
        return;
      }

      const senderAccountId = selectedSenderId || connectedAccounts[0]?.id;

      const fullEmailBody = signature 
        ? `${generatedEmail}\n\n${signature}`
        : generatedEmail;

      const { data, error } = await supabase.functions.invoke('send-email', {
        body: {
          to: lead.contact_email,
          subject: subjectLine,
          body: fullEmailBody,
          integrationId: 'google',
          integrationRowId: senderAccountId,
          leadId: selectedLead,
          templateId: currentTemplateId,
        }
      });

      if (error) throw error;
      
      // Store info for follow-up suggestion before clearing form
      const sentLeadInfo = {
        leadId: selectedLead,
        leadName: lead.contact_name,
        leadEmail: lead.contact_email,
        companyName: lead.company_name,
        subject: subjectLine,
      };
      
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
      setCurrentTemplateId(null);
      loadCounts();
      
      // Show AI follow-up suggestion for introductory emails
      setLastSentEmailInfo(sentLeadInfo);
      setShowFollowUpSuggestion(true);
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

  const scheduleEmail = async () => {
    if (!selectedLead || !generatedEmail || !scheduleDate) {
      toast({
        title: "Missing information",
        description: "Please select a lead, generate an email, and pick a schedule date",
        variant: "destructive",
      });
      return;
    }

    setIsScheduling(true);
    try {
      const lead = leads.find((l) => l.id === selectedLead);
      if (!lead?.contact_email) throw new Error("Lead does not have an email address");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Combine date + time
      const [hours, minutes] = scheduleTime.split(":").map(Number);
      const scheduledAt = new Date(scheduleDate);
      scheduledAt.setHours(hours, minutes, 0, 0);

      if (scheduledAt <= new Date()) {
        toast({
          title: "Invalid schedule time",
          description: "Please select a future date and time",
          variant: "destructive",
        });
        setIsScheduling(false);
        return;
      }

      const fullEmailBody = signature
        ? `${generatedEmail}\n\n${signature}`
        : generatedEmail;

      // Format body as HTML
      const isHtml = fullEmailBody.trim().startsWith('<');
      const htmlBody = isHtml ? fullEmailBody : `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}p{margin:0 0 16px}</style></head><body>
${fullEmailBody.split('\n').map((line: string) => line.trim() ? `<p>${line}</p>` : '').join('\n')}
</body></html>`;

      const { error } = await supabase.from("sent_emails").insert({
        user_id: user.id,
        lead_id: selectedLead,
        to_email: lead.contact_email,
        subject: subjectLine,
        body_html: htmlBody,
        body_text: generatedEmail,
        template_id: currentTemplateId || null,
        status: "scheduled",
        scheduled_at: scheduledAt.toISOString(),
      });

      if (error) throw error;

      toast({
        title: "Email scheduled!",
        description: `Email to ${lead.contact_name} scheduled for ${format(scheduledAt, "PPP 'at' p")}`,
      });

      // Clear form
      if (currentDraftId) {
        await supabase.from("email_drafts").delete().eq("id", currentDraftId);
        setCurrentDraftId(null);
      }
      setGeneratedEmail("");
      setSelectedLead("");
      setSubjectLine("");
      setTriggerContext("");
      setOpenerWord("");
      setCurrentTemplateId(null);
      setScheduleDate(undefined);
      setScheduleTime("09:00");
      setSchedulePopoverOpen(false);
      loadCounts();
    } catch (error: any) {
      toast({
        title: "Error scheduling email",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsScheduling(false);
    }
  };

  const scheduleCalendarMeeting = async () => {
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

  const handleSetupFollowUp = (suggestion: FollowUpData) => {
    if (!lastSentEmailInfo) return;
    
    // Set up the compose form with follow-up content
    setSelectedLead(lastSentEmailInfo.leadId);
    setSubjectLine(suggestion.suggestedSubject);
    setGeneratedEmail(suggestion.suggestedBody);
    setTriggerContext(suggestion.triggerContext);
    setSelectedTemplate("follow_up");
    
    // Dismiss the suggestion
    setShowFollowUpSuggestion(false);
    setLastSentEmailInfo(null);
    
    toast({
      title: "Follow-up ready!",
      description: "Email composer has been set up with your follow-up. Edit and send when ready.",
    });
  };

  const handleDismissFollowUp = () => {
    setShowFollowUpSuggestion(false);
    setLastSentEmailInfo(null);
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
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={showShortcuts ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowShortcuts(!showShortcuts)}
                    className="hidden md:flex"
                  >
                    <Keyboard className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{showShortcuts ? "Hide" : "Show"} keyboard shortcuts</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
        </div>

        {/* Collapsible Keyboard Shortcuts Card */}
        {showShortcuts && (
          <div className="hidden md:flex items-center justify-between px-4 py-3 bg-muted/50 border rounded-lg animate-fade-in">
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Keyboard className="w-4 h-4 text-primary" />
              <span className="font-medium text-foreground">Shortcuts:</span>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                  <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono shadow-sm">Ctrl+G</kbd>
                  <span>Generate</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono shadow-sm">Ctrl+S</kbd>
                  <span>Save</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono shadow-sm">Ctrl+Enter</kbd>
                  <span>Send</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <kbd className="px-2 py-1 bg-background border rounded text-xs font-mono shadow-sm">Ctrl+D</kbd>
                  <span>Drafts</span>
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowShortcuts(false)}
              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {/* AI Follow-up Suggestion */}
        {showFollowUpSuggestion && lastSentEmailInfo && (
          <FollowUpSuggestion
            leadId={lastSentEmailInfo.leadId}
            leadName={lastSentEmailInfo.leadName}
            leadEmail={lastSentEmailInfo.leadEmail}
            companyName={lastSentEmailInfo.companyName}
            originalSubject={lastSentEmailInfo.subject}
            onSetupFollowUp={handleSetupFollowUp}
            onDismiss={handleDismissFollowUp}
          />
        )}

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
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Performance
            </TabsTrigger>
          </TabsList>

          <TabsContent value="compose" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold">Email Configuration</h2>
                  <div className="flex items-center gap-2">
                    <EmailTemplateManager
                      currentTemplate={{
                        goal: selectedTemplate ? EMAIL_TEMPLATES.find(t => t.value === selectedTemplate)?.goal : undefined,
                        suggestedSubject: subjectLine,
                        triggerContext,
                        socialProof,
                      }}
                      onLoadTemplate={(template: UserEmailTemplate) => {
                        if (template.suggested_subject) setSubjectLine(template.suggested_subject);
                        if (template.trigger_context) setTriggerContext(template.trigger_context);
                        if (template.social_proof) setSocialProof(template.social_proof);
                        if (template.goal) {
                          const matchingTemplate = EMAIL_TEMPLATES.find(t => t.goal === template.goal);
                          if (matchingTemplate) setSelectedTemplate(matchingTemplate.value);
                        }
                        setCurrentTemplateId(template.id);
                      }}
                    />
                    {currentDraftId && (
                      <Button variant="ghost" size="sm" onClick={clearForm}>
                        New Email
                      </Button>
                    )}
                  </div>
                </div>
                <div className="space-y-4">
                  {/* Send From selector */}
                  <div>
                    <Label>
                      Send From
                      {connectedAccounts.length === 0 && (
                        <span className="ml-2 text-xs text-destructive">No accounts connected</span>
                      )}
                    </Label>
                    {connectedAccounts.length > 0 ? (
                      <Select value={selectedSenderId} onValueChange={setSelectedSenderId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select sending account" />
                        </SelectTrigger>
                        <SelectContent>
                          {connectedAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              <div className="flex items-center gap-2">
                                <Mail className="w-3 h-3 text-muted-foreground" />
                                {account.email}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground mt-1">
                        Connect a Google account in{" "}
                        <a href="/integrations" className="text-primary underline">Integrations</a>
                        {" "}to start sending.
                      </p>
                    )}
                  </div>

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

                  <div>
                    <Label>
                      Email Template
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="ml-1 text-muted-foreground cursor-help">ⓘ</span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p>Choose a template to guide the AI's email structure and purpose</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </Label>
                    <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a template (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        {EMAIL_TEMPLATES.map((template) => (
                          <SelectItem key={template.value} value={template.value}>
                            <div className="flex flex-col">
                              <span>{template.label}</span>
                              <span className="text-xs text-muted-foreground">{template.description}</span>
                            </div>
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
                          <SelectItem value="auto">Auto-select</SelectItem>
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
                    <div className="flex gap-2">
                      <Input
                        value={triggerContext}
                        onChange={(e) => setTriggerContext(e.target.value)}
                        placeholder="e.g., Saw you just raised Series A from Accel..."
                        maxLength={300}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={generateTriggerContext}
                        disabled={isGeneratingTrigger || !selectedLead}
                        className="shrink-0"
                      >
                        {isGeneratingTrigger ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    {!selectedLead && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ Select a lead above to enable AI generation
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      This becomes your personalized email opener
                    </p>
                  </div>

                  <div>
                    <Label>
                      Social Proof
                      <Badge variant="outline" className="ml-2 text-xs">Saved</Badge>
                    </Label>
                    <div className="flex gap-2">
                      <Textarea
                        value={socialProof}
                        onChange={(e) => handleSocialProofChange(e.target.value)}
                        placeholder="e.g., Spot and Ignite are customers of ours. We helped them cut board prep time by 50%..."
                        className="min-h-[80px] flex-1"
                        maxLength={500}
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 self-start"
                        onClick={generateSocialProofText}
                        disabled={isGeneratingSocialProof || !selectedLead}
                      >
                        {isGeneratingSocialProof ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    {!selectedLead && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ Select a lead above to enable AI generation
                      </p>
                    )}
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
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={generateSubjectLine}
                        disabled={isGeneratingSubject || !selectedLead}
                        className="shrink-0"
                      >
                        {isGeneratingSubject ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                    {!selectedLead && (
                      <p className="text-xs text-amber-600 mt-1">
                        ⚠️ Select a lead above to enable AI generation
                      </p>
                    )}
                  </div>

                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button
                        onClick={generateEmail}
                        disabled={isGenerating || !selectedLead}
                        className="flex-1 bg-gradient-to-r from-primary to-accent hover:opacity-90"
                        size="lg"
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
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="lg"
                              onClick={generateABVariants}
                              disabled={isGeneratingVariants || !selectedLead}
                            >
                              {isGeneratingVariants ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Shuffle className="w-4 h-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Generate 3 A/B variants to compare</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                    <p className="text-xs text-muted-foreground text-center">
                      Uses proven 4-sentence framework • Click shuffle for A/B testing
                    </p>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={saveDraft}
                        disabled={isSavingDraft || (!selectedLead && !subjectLine && !generatedEmail)}
                        className="flex-1"
                      >
                        {isSavingDraft ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : (
                          <>
                            <Save className="w-4 h-4 mr-2" />
                            Save Draft
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* A/B Variant Picker */}
                  {showVariantPicker && (
                    <div className="mt-4 p-4 border rounded-lg bg-muted/20">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-sm">A/B Email Variants</h3>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => {
                            setShowVariantPicker(false);
                            setEmailVariants([]);
                          }}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                      {isGeneratingVariants ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-6 h-6 animate-spin mr-2" />
                          <span className="text-sm text-muted-foreground">Generating 3 variants...</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {emailVariants.map((variant, index) => (
                            <div
                              key={variant.id}
                              className="p-3 border rounded-lg bg-background hover:border-primary cursor-pointer transition-colors"
                              onClick={() => selectVariant(variant)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <Badge variant="outline" className="mb-2">Variant {index + 1}</Badge>
                                  <p className="text-sm font-medium truncate">{variant.subject}</p>
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {variant.body.slice(0, 120)}...
                                  </p>
                                </div>
                                <Button variant="ghost" size="icon" className="shrink-0">
                                  <Check className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>

              <Card className="p-6">
                <h2 className="text-xl font-semibold mb-4">Generated Email</h2>
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
                  <div>
                    <Label>Email Body</Label>
                    <div className="flex gap-2 mt-1.5">
                      <Textarea
                        value={generatedEmail}
                        onChange={(e) => setGeneratedEmail(e.target.value)}
                        className="min-h-[280px] flex-1"
                        placeholder="Your personalized sales email will appear here. Click the wand icon to generate with AI..."
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 self-start"
                        onClick={generateEmail}
                        disabled={isGenerating || !selectedLead}
                      >
                        {isGenerating ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Wand2 className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                  {generatedEmail && (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <Button 
                          className="flex-1"
                          onClick={sendEmail}
                          disabled={isSending || isScheduling}
                        >
                          {isSending ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              Sending...
                            </>
                          ) : (
                            <>
                              <Send className="w-4 h-4 mr-2" />
                              Send Now
                            </>
                          )}
                        </Button>
                        <Popover open={schedulePopoverOpen} onOpenChange={setSchedulePopoverOpen}>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              disabled={isSending || isScheduling}
                            >
                              <Clock className="w-4 h-4 mr-2" />
                              Schedule
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-4 max-h-[80vh] overflow-y-auto" align="end" side="top">
                            <div className="space-y-3">
                              <p className="text-sm font-medium">Schedule Send</p>
                              <Calendar
                                mode="single"
                                selected={scheduleDate}
                                onSelect={setScheduleDate}
                                disabled={(date) => date < new Date(new Date().setHours(0,0,0,0))}
                                className={cn("p-3 pointer-events-auto")}
                              />
                              <div>
                                <Label className="text-xs">Time</Label>
                                <Input
                                  type="time"
                                  value={scheduleTime}
                                  onChange={(e) => setScheduleTime(e.target.value)}
                                  className="mt-1"
                                />
                              </div>
                              {scheduleDate && (
                                <p className="text-xs text-muted-foreground">
                                  Will send on {format(scheduleDate, "PPP")} at {scheduleTime}
                                </p>
                              )}
                              <Button
                                className="w-full"
                                onClick={scheduleEmail}
                                disabled={isScheduling || !scheduleDate}
                              >
                                {isScheduling ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Scheduling...
                                  </>
                                ) : (
                                  <>
                                    <Clock className="w-4 h-4 mr-2" />
                                    Schedule Email
                                  </>
                                )}
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                        {subjectLine.toLowerCase().includes("meeting") && (
                          <Button 
                            variant="outline"
                            onClick={scheduleCalendarMeeting}
                          >
                            <CalendarPlus className="w-4 h-4 mr-2" />
                            Add to Calendar
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
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

          <TabsContent value="performance" className="mt-6">
            <EmailPerformanceStats />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Outreach;
