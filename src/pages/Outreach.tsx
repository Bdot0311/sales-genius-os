import { useState, useEffect, useCallback, useRef } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Send, Sparkles, CalendarPlus, Settings2, Image, Upload, Wand2, Mail, FileText, Save, Shuffle, Check, X, Keyboard, Clock, AlertTriangle, Monitor, Smartphone } from "lucide-react";
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
import { BarChart3, ListOrdered, Layout, Users } from "lucide-react";
import { BulkSendDialog } from "@/components/outreach/BulkSendDialog";
import { EmailQualityChecker, scoreEmailQuality } from "@/components/outreach/EmailQualityChecker";
import { SequencesList, MessageBlocksList } from "@/components/sequences";
import { generateComplianceFooter, validateSenderDomain, checkSendTimeCompliance, parseSpintax } from "@/lib/compliance";
import { AlertCircle, Ban } from "lucide-react";

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
    value: "introduction",
    label: "Cold Introduction",
    description: "First contact introduction",
    goal: "introduction",
    suggestedSubject: "quick q about {company}",
    category: "standard",
  },
  {
    value: "follow_up",
    label: "Follow-up",
    description: "Follow up on previous outreach",
    goal: "follow-up",
    suggestedSubject: "re: {company}",
    category: "standard",
  },
  {
    value: "meeting_request",
    label: "Meeting Request",
    description: "Request a quick call or meeting",
    goal: "meeting",
    suggestedSubject: "quick call — {company}?",
    category: "standard",
  },
  {
    value: "demo_invite",
    label: "Demo Invite",
    description: "Invite to see a product demo",
    goal: "demo",
    suggestedSubject: "15-min demo for {company}?",
    category: "standard",
  },
  {
    value: "proposal",
    label: "Proposal",
    description: "Send a proposal or offer",
    goal: "proposal",
    suggestedSubject: "proposal for {company}",
    category: "standard",
  },
  {
    value: "signal_funding",
    label: "Just Raised Funding",
    description: "They recently announced a funding round — ideal time to reach new budget holders",
    goal: "introduction",
    suggestedSubject: "congrats on the raise — quick q",
    category: "signal",
  },
  {
    value: "signal_new_exec",
    label: "New Executive Hire",
    description: "New leader just joined — they're evaluating tools and building their stack",
    goal: "introduction",
    suggestedSubject: "re: building your stack at {company}",
    category: "signal",
  },
  {
    value: "signal_job_posting",
    label: "Hiring Signal",
    description: "They're hiring for a role your product helps with — strong intent signal",
    goal: "introduction",
    suggestedSubject: "{company}'s {job} hire — quick thought",
    category: "signal",
  },
  {
    value: "signal_competitor",
    label: "Competitor Customer",
    description: "They're using a competitor — make the case to switch",
    goal: "introduction",
    suggestedSubject: "switching from {competitor}?",
    category: "signal",
  },
  {
    value: "signal_expansion",
    label: "Company Expansion",
    description: "They're expanding — new office, new market, or headcount growth",
    goal: "introduction",
    suggestedSubject: "scaling {company}'s outbound",
    category: "signal",
  },
  {
    value: "signal_dogfood",
    label: "Using a Competitor",
    description: "They are currently using a competitor product",
    goal: "introduction",
    suggestedSubject: "a better alternative to {competitor}",
    category: "signal",
  },
];

const stripHtmlToText = (html: string): string => {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

function getBestSendTime(lead: any): string {
  const loc = ((lead?.location || '') + ' ' + (lead?.company_location || '')).toLowerCase();
  let tz = 'America/New_York';
  if (/nyc|new york|est/.test(loc)) tz = 'America/New_York';
  else if (/los angeles|san francisco|pst|seattle|portland/.test(loc)) tz = 'America/Los_Angeles';
  else if (/chicago|cst|dallas|houston/.test(loc)) tz = 'America/Chicago';
  else if (/london|uk|england/.test(loc)) tz = 'Europe/London';
  const label = tz.split('/')[1]?.replace('_', ' ') || 'ET';
  return `Best time: Tue–Thu, 8–10am ${label}`;
}

function scoreSubjectLine(subject: string, lead?: any): { score: number; flags: string[] } {
  if (!subject) return { score: 100, flags: [] };
  let score = 100;
  const flags: string[] = [];

  if (subject.length > 60) { score -= 20; flags.push('Over 60 characters'); }
  if (subject.length > 0 && subject.length < 10) { score -= 20; flags.push('Too short'); }
  if (/^re:|^fwd:/i.test(subject)) { score -= 25; flags.push('Fake reply/forward prefix'); }
  if (/\b[A-Z]{3,}\b/.test(subject)) { score -= 15; flags.push('All-caps words'); }

  if (lead) {
    const firstName = lead.contact_name?.split(' ')[0]?.toLowerCase() || '';
    const company = lead.company_name?.toLowerCase() || '';
    const sub = subject.toLowerCase();
    if ((firstName && sub.includes(firstName)) || (company && sub.includes(company))) {
      score += 10;
    }
  }

  score = Math.max(0, Math.min(100, score));
  return { score, flags };
}

interface EmailVariant {
  id: string;
  subject: string;
  body: string;
  label?: string;
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
  const [businessDescription, setBusinessDescription] = useState("");
  const [subjectLine, setSubjectLine] = useState("");
  const [isGeneratingSubject, setIsGeneratingSubject] = useState(false);
  const [isGeneratingTrigger, setIsGeneratingTrigger] = useState(false);
  
  const [generatedEmail, setGeneratedEmail] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [fixingCheck, setFixingCheck] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [signature, setSignature] = useState("");
  const [senderProfileName, setSenderProfileName] = useState("");
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
  const [use4SentenceFramework, setUse4SentenceFramework] = useState(false);
  const [showFollowUpSuggestion, setShowFollowUpSuggestion] = useState(false);
  const [lastSentEmailInfo, setLastSentEmailInfo] = useState<{
    leadId: string;
    leadName: string;
    leadEmail: string;
    companyName: string;
    subject: string;
    jobTitle?: string;
    industry?: string;
    companyDescription?: string;
    technologies?: string[];
  } | null>(null);
  
  // Multi-sender state
  const [connectedAccounts, setConnectedAccounts] = useState<Array<{ id: string; email: string }>>([]);
  const [selectedSenderId, setSelectedSenderId] = useState("");
  
  // Schedule state
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>(undefined);
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [isScheduling, setIsScheduling] = useState(false);
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);

  // Daily email limit state
  const [dailyEmailLimit, setDailyEmailLimit] = useState(10);
  const [dailyEmailsSent, setDailyEmailsSent] = useState(0);
  const [isSavingLimit, setIsSavingLimit] = useState(false);

  // Follow-up reminders state
  const [dueFollowUps, setDueFollowUps] = useState<Array<{ id: string; subject: string; lead_id: string | null; due_date: string }>>([]);

  // P0.1 — Plain text first-touch toggle
  const [isFirstTouch, setIsFirstTouch] = useState(true);

  // P1.2 — Auto-queue follow-up
  const [autoQueueFollowUp, setAutoQueueFollowUp] = useState(false);

  // P3.1 — Mobile preview
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");

  // Compliance state
  const [complianceSettings, setComplianceSettings] = useState({
    physicalAddress: "",
    includeUnsubscribe: true,
    includeComplianceFooter: true,
    userId: "",
  });
  const [domainWarnings, setDomainWarnings] = useState<string[]>([]);
  const [sendTimeWarning, setSendTimeWarning] = useState<string | null>(null);
  const [useSpintax, setUseSpintax] = useState(false);

  useEffect(() => {
    loadLeads();
    loadSignature();
    loadBusinessDescription();
    loadCounts();
    loadConnectedAccounts();
    loadDailyEmailLimit();
    loadDueFollowUps();
    loadComplianceSettings();
  }, []);

  const loadDueFollowUps = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const now = new Date().toISOString();
    const { data } = await supabase
      .from("activities")
      .select("id, subject, lead_id, due_date")
      .eq("user_id", user.id)
      .eq("type", "follow_up")
      .eq("completed", false)
      .lte("due_date", now)
      .order("due_date", { ascending: true })
      .limit(5);
    if (data) setDueFollowUps(data);
  };

  const dismissFollowUpReminder = async (id: string) => {
    await supabase.from("activities").update({ completed: true }).eq("id", id);
    setDueFollowUps(prev => prev.filter(f => f.id !== id));
  };

  const loadDailyEmailLimit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('subscriptions')
      .select('daily_email_limit, daily_emails_sent, daily_emails_reset_at')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .maybeSingle();
    if (data) {
      const now = new Date();
      const resetAt = data.daily_emails_reset_at ? new Date(data.daily_emails_reset_at) : new Date(0);
      const todayMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      setDailyEmailLimit(data.daily_email_limit || 10);
      setDailyEmailsSent(resetAt < todayMidnight ? 0 : (data.daily_emails_sent || 0));
    }
  };

  const saveDailyLimit = async (newLimit: number) => {
    if (newLimit < 1) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setIsSavingLimit(true);
    const { error } = await supabase
      .from('subscriptions')
      .update({ daily_email_limit: newLimit } as any)
      .eq('user_id', user.id)
      .eq('status', 'active');
    setIsSavingLimit(false);
    if (!error) {
      setDailyEmailLimit(newLimit);
      toast({ title: "Daily limit updated", description: `Set to ${newLimit} emails/day` });
    }
  };

  const loadConnectedAccounts = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from('integrations')
      .select('id, connected_email')
      .eq('user_id', user.id)
      .eq('integration_id', 'google')
      .eq('is_active', true);
    
    if (data && data.length > 0) {
      const accounts = data.map(row => ({
        id: row.id,
        email: row.connected_email || 'Unknown account',
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const [sentResult, draftsResult] = await Promise.all([
      supabase.from('sent_emails').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('email_drafts').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
    ]);
    setSentCount(sentResult.count || 0);
    setDraftsCount(draftsResult.count || 0);
  };

  const loadLeads = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from("leads").select("*").eq("user_id", user.id);
    if (data) setLeads(data);
  };

  const loadSignature = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("email_signature, full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    
    if (data?.email_signature) {
      setSignature(data.email_signature);
    }

    const defaultName = data?.full_name?.trim() || data?.email?.split("@")[0] || user.email?.split("@")[0] || "";
    setSenderProfileName(defaultName);
  };

  const loadComplianceSettings = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (data) {
      const profileData = data as Record<string, unknown>;
      setComplianceSettings({
        physicalAddress: (profileData.physical_address as string) || "",
        includeUnsubscribe: profileData.include_unsubscribe !== false,
        includeComplianceFooter: profileData.include_compliance_footer !== false,
        userId: user.id,
      });
    }
  };

  const formatNameFromEmail = (email: string) => {
    const localPart = email.split("@")[0] || "";
    return localPart
      .replace(/[._-]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  };

  const getSenderName = () => {
    if (senderProfileName.trim()) {
      return senderProfileName.trim();
    }

    const selectedAccountEmail =
      connectedAccounts.find((account) => account.id === selectedSenderId)?.email ||
      connectedAccounts[0]?.email || "";

    return formatNameFromEmail(selectedAccountEmail);
  };

  const resolveSenderName = async () => {
    const currentSenderName = getSenderName();
    if (currentSenderName) {
      return currentSenderName;
    }

    const { data: { user } } = await supabase.auth.getUser();
    return formatNameFromEmail(user?.email || "");
  };

  const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const stripTrailingPlaceholderName = (body: string) => {
    const lines = body.trimEnd().split(/\r?\n/);

    while (lines.length > 0 && !lines[lines.length - 1].trim()) {
      lines.pop();
    }

    if (lines.length === 0) return "";

    const lastLine = lines[lines.length - 1].trim();
    const isPlaceholderName = /^(?:\[name\]|\{name\}|\{\{\s*name\s*\}\}|<name>|name)$/i.test(lastLine);

    if (!isPlaceholderName) {
      return body.trimEnd();
    }

    lines.pop();

    while (lines.length > 0 && !lines[lines.length - 1].trim()) {
      lines.pop();
    }

    const trailingLine = lines[lines.length - 1]?.trim() || "";
    const isSignOff = /^(best(?: regards)?|regards|thanks|thank you|sincerely|cheers)[\s,!.:-]*$/i.test(trailingLine);

    return isSignOff ? lines.join("\n") : body.trimEnd();
  };

  const sanitizeGeneratedEmailBody = (body: string) => {
    const withoutPlaceholders = body
      .replace(/\[(?:name|company|first\s*name|full\s*name)\]/gi, "")
      .replace(/\{\{\s*(?:name|company|first\s*name|full\s*name)\s*\}\}/gi, "")
      .replace(/\{(?:name|company|first\s*name|full\s*name)\}/gi, "")
      .replace(/<(?:name|company|first\s*name|full\s*name)>/gi, "")
      .replace(/[ \t]+\n/g, "\n");

    return stripTrailingPlaceholderName(withoutPlaceholders).trim();
  };

  const hasSenderAsOwnLine = (content: string, senderName: string) => {
    if (!senderName) return false;
    const senderLineRegex = new RegExp(`(^|\\n)\\s*${escapeRegExp(senderName)}\\s*(\\n|$)`, "i");
    return senderLineRegex.test(content);
  };

  const appendSenderLine = (body: string, senderName: string) => {
    const trimmedBody = stripTrailingPlaceholderName(body);
    if (!senderName || hasSenderAsOwnLine(trimmedBody, senderName)) {
      return trimmedBody;
    }

    const lines = trimmedBody.split(/\r?\n/);
    let lastNonEmptyIndex = -1;

    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].trim()) {
        lastNonEmptyIndex = i;
        break;
      }
    }

    if (lastNonEmptyIndex >= 0) {
      const signOffLine = lines[lastNonEmptyIndex].trim();
      const isSignOff = /^(best(?: regards)?|regards|thanks|thank you|sincerely)[\s,!.:-]*$/i.test(signOffLine);

      if (isSignOff) {
        const hasTextAfterSignOff = lines.slice(lastNonEmptyIndex + 1).some((line) => line.trim().length > 0);
        if (!hasTextAfterSignOff) {
          return [...lines.slice(0, lastNonEmptyIndex + 1), senderName].join("\n");
        }
      }
    }

    return `${trimmedBody}\n${senderName}`;
  };

  const buildEmailBodyWithSignature = (baseEmailBody: string, resolvedSenderName?: string, firstTouch?: boolean, leadId?: string) => {
    const senderName = (resolvedSenderName ?? getSenderName()).trim();
    const normalizedSender = senderName.toLowerCase();
    const useFirstTouch = firstTouch !== undefined ? firstTouch : isFirstTouch;

    // Apply spintax if enabled
    let processedBody = useSpintax ? parseSpintax(baseEmailBody) : baseEmailBody;

    const rawSignature = signature
      .replace(/width=["']150["']/gi, 'width="320"')
      .replace(/max-width:\s*150px/gi, 'max-width:320px');

    const signatureForEmail = useFirstTouch ? stripHtmlToText(rawSignature) : rawSignature;

    const signatureText = signatureForEmail
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    const signatureHasSender = normalizedSender && signatureText.includes(normalizedSender);
    const cleanedBaseEmailBody = stripTrailingPlaceholderName(processedBody);
    const bodyWithSender = signatureHasSender
      ? cleanedBaseEmailBody
      : appendSenderLine(cleanedBaseEmailBody, senderName);

    let emailBody = signatureForEmail ? `${bodyWithSender}\n\n${signatureForEmail}` : bodyWithSender;

    // Add compliance footer
    if (complianceSettings.includeComplianceFooter && complianceSettings.physicalAddress) {
      const footer = generateComplianceFooter({
        includeUnsubscribe: complianceSettings.includeUnsubscribe,
        includePhysicalAddress: true,
        userId: complianceSettings.userId,
        leadId,
        physicalAddress: complianceSettings.physicalAddress,
      });
      if (footer) {
        emailBody = `${emailBody}\n\n---\n${footer}`;
      }
    }

    return emailBody;
  };

  const loadBusinessDescription = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    const { data } = await supabase
      .from("profiles")
      .select("business_description")
      .eq("id", user.id)
      .single();
    
    if (data?.business_description) {
      setBusinessDescription(data.business_description);
    }
  };

  const saveBusinessDescription = async (value: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    
    await supabase
      .from("profiles")
      .update({ business_description: value } as any)
      .eq("id", user.id);
  };

  const debouncedSaveBusinessDescription = useCallback(
    debounce((value: string) => saveBusinessDescription(value), 1000),
    []
  );

  const handleBusinessDescriptionChange = (value: string) => {
    setBusinessDescription(value);
    debouncedSaveBusinessDescription(value);
  };

  const saveSignature = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    setIsSavingSignature(true);
    try {
      // Use upsert so it works even if the profile row doesn't exist yet
      const { error } = await supabase
        .from("profiles")
        .update({ email_signature: signature })
        .eq("id", user.id);

      if (error) throw error;

      // Verify it was actually persisted
      const { data: check } = await supabase
        .from("profiles")
        .select("email_signature")
        .eq("id", user.id)
        .maybeSingle();

      if (signature && !check?.email_signature) {
        throw new Error("Signature did not save — check Supabase RLS policies on the profiles table.");
      }

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

      const imgHtml = `<img src="${publicUrl}" alt="Logo" width="320" style="display:block;max-width:320px;width:100%;height:auto;margin-top:8px;" />`;
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
      const template = EMAIL_TEMPLATES.find(t => t.value === selectedTemplate);
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          lead,
          tone: emailTone,
          goal: "subject_only",
          templateGoal: template?.goal || "introduction",
          templateDescription: template?.description || "",
          triggerContext,
          openerWord: openerWord === "auto" ? "" : openerWord,
          businessDescription,
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
          businessDescription,
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
      // Use the goal from the selected template — default to introduction
      const template = EMAIL_TEMPLATES.find(t => t.value === selectedTemplate);
      const goal = template?.goal || "introduction";

      // If no subject line, generate one tailored to the template goal
      let finalSubjectLine = subjectLine;
      if (!finalSubjectLine) {
        const { data: subjectData, error: subjectError } = await supabase.functions.invoke("generate-email", {
          body: {
            lead,
            tone: emailTone,
            goal: "subject_only",
            templateGoal: goal,
            templateValue: template?.value || "",
            templateDescription: template?.description || "",
            triggerContext,
            openerWord: openerWord === "auto" ? "" : openerWord,
            businessDescription,
          },
        });
        if (subjectError) throw subjectError;
        finalSubjectLine = subjectData.email.replace(/^Subject:\s*/i, '').trim();
        setSubjectLine(finalSubjectLine);
      }

      // Generate the email body using the actual template goal
      const { data, error } = await supabase.functions.invoke("generate-email", {
        body: {
          lead,
          tone: emailTone,
          goal,
          templateValue: template?.value || "",
          templateDescription: template?.description || "",
          subjectLine: finalSubjectLine,
          triggerContext,
          openerWord: openerWord === "auto" ? "" : openerWord,
          businessDescription,
          use4SentenceFramework,
        },
      });

      if (error) throw error;
      const senderName = await resolveSenderName();
      const emailBody = appendSenderLine(sanitizeGeneratedEmailBody(data.email), senderName);
      if (senderName && !senderProfileName.trim()) {
        setSenderProfileName(senderName);
      }
      setGeneratedEmail(emailBody);
      toast({
        title: "Email generated",
        description: "AI created a personalized sales email designed to book meetings",
      });
    } catch (error: any) {
      // FunctionsHttpError bodies contain the real message from the edge function
      let description = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.error) description = body.error;
      } catch {}
      toast({
        title: "Error generating email",
        description,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleQualityFix = async (checkLabel: string) => {
    if (!generatedEmail || fixingCheck) return;
    setFixingCheck(checkLabel);

    // Hard constraints that MUST hold after every fix — same rules as the edge function
    const IMMUTABLE_RULES = `
IMMUTABLE RULES — these apply regardless of the fix task:
- Total email body MUST stay under 75 words. Count carefully.
- NEVER use: "I noticed", "I hope this finds you", "I wanted to reach out", "just reaching out", "touching base", "circling back", "I came across", "as a leader in", "innovative solution", "cutting-edge", "synergy", "leverage", "I'd love to connect", "looking forward to hearing from you", "quick question", "just following up", "wanted to follow up"
- Greeting stays as "Hi [FirstName]," — do not change it
- Sign-off stays as just the sender's first name on its own line — do not add "Best," or "Thanks,"
- Do NOT introduce new percentage claims, statistics, or unverified benchmarks
- Do NOT add new links or URLs
- Do NOT add new placeholder tokens like [Name] or {company}
- Return ONLY the email body — no subject line, no headers, no explanation`;

    // Surgical, targeted instructions per check — only touch what's broken
    const fixInstructions: Record<string, string> = {
      'Spam Risk': `TASK: Remove spam-trigger words only. Identify words like "free", "guarantee", "winner", "act now", "limited time", "special promotion", "earn money", "risk free" and replace each with a plain business equivalent. Change as FEW words as possible — do not rewrite sentences that don't contain spam words.`,
      'Length': `TASK: Adjust the word count to 50–70 words. If over 70 words, cut the most generic or redundant sentence. If under 40 words, add one specific detail about the prospect's situation. Do not change the opening line or the CTA.`,
      'Readability': `TASK: Simplify sentence structure only. Find any sentence over 20 words and split it or shorten it. Replace multi-syllable words (e.g. "utilize" → "use", "facilitate" → "help", "leverage" → "use"). Do not change the meaning or the CTA.`,
      'CTA': `TASK: Fix the call-to-action only. Replace the current ask with a single low-friction question on the last content line before the sign-off. Use one of: "Worth a look?", "Open to seeing it?", "Worth a quick chat?", "Should I send a 2-minute breakdown?", or "Want to compare to your current process?" — pick whichever fits the email's tone. Do not change the opening or body.`,
      'Personalization': `TASK: Remove unfilled placeholder tokens only. Find any text matching patterns like [Name], [Company], {name}, {company}, <FirstName>, {{company}} and replace with a natural generic reference (e.g. "your team", "your company", "your workflow"). Change nothing else.`,
      'Credibility': `TASK: Remove or soften unverified claims only. Find percentage stats, multiplier claims (3x, 4x), benchmark numbers, or phrases like "teams cut ramp time" and either remove them or replace with a specific but unquantified outcome (e.g. "3x faster" → "noticeably faster"). Change nothing else.`,
      'Naturalness': `TASK: Rewrite the opening line only (the first sentence after "Hi [Name],"). It must NOT start with: "I noticed", "I hope", "I wanted", "Just", "I came across", "I was", "I've been". Start with a direct observation about their company or role — something that shows you understand their world right now. Keep the rest of the email exactly as-is.`,
      'Links': `TASK: Remove URLs and hyperlinks only. Find all instances of http://, https://, href= and remove them. If a URL was inline, replace it with a plain-text description of what it was linking to. Change nothing else.`,
      'Images': `TASK: Remove HTML image tags only. Delete every <img ...> tag from the email. Change nothing else.`,
      'You-focus': `TASK: Flip sentence subjects where possible. Find sentences that start with "I" or "We" and rewrite them to start from the prospect's perspective ("Your team", "You", "Your workflow"). Aim to convert at least 2 "I/We" sentences. Keep all facts and the CTA identical.`,
      'CTA position': `TASK: Move the CTA to the last line before the sign-off only. Find the question or call-to-action sentence and move it to immediately before the sender's name. Reorder sentences if needed but do not rewrite them. The sign-off (sender name) stays last.`,
      'Signature': `TASK: This is a manual fix — the HTML signature block is too long relative to the email body. Return the email body unchanged and append this note on a new line at the very end: "[Tip: Shorten your signature in Settings → Email Signature to improve deliverability]"`,
      'Word Ceiling': `TASK: Trim the email body to under 75 words. Cut the most generic or redundant sentence first. If still over, compress the context sentence. Preserve the greeting, the specific hook/observation, and the final CTA question exactly. Do not rewrite — only delete.`,
      'CTA Question': `TASK: Fix the question count. The email must end with exactly ONE question mark — on the final content line before the sign-off. If there are zero questions, convert the closing statement into one low-friction question (e.g. "Worth a look?", "Open to seeing it?"). If there are multiple, keep only the final one and convert the others to statements. Change nothing else.`,
    };

    // Banned Phrases check — look up the actual banned phrase currently present in the body
    // so the model knows exactly what to remove.
    let instruction = fixInstructions[checkLabel];
    if (!instruction && checkLabel === 'Banned Phrases') {
      const BANNED = [
        'hope this finds you well', 'just checking in', 'reaching out because',
        'leverage', 'optimize', 'streamline', 'synergy',
        'revolutionar', 'cutting-edge', 'industry-leading', 'best-in-class',
      ];
      const lower = generatedEmail.toLowerCase();
      const hit = BANNED.find((p) => lower.includes(p));
      instruction = hit
        ? `TASK: Remove the banned phrase "${hit}" from the email body. Replace it with a plain, direct equivalent that keeps the sentence meaning. Change as FEW words as possible — do not rewrite surrounding sentences.`
        : `TASK: Scan for cold-outreach banned phrases ("hope this finds you well", "just checking in", "reaching out because", "leverage", "optimize", "streamline", "synergy", "revolutionary", "cutting-edge", "industry-leading", "best-in-class") and replace the first match with a plain equivalent. Change nothing else.`;
    }
    if (!instruction) {
      instruction = `Fix only the following issue and nothing else: ${checkLabel}`;
    }
    const lead = leads.find((l) => l.id === selectedLead);

    try {
      const { data, error } = await supabase.functions.invoke('generate-email', {
        body: {
          lead,
          tone: emailTone,
          goal: 'custom',
          customInstruction: `You are a precision editor for cold outbound emails. Your job is to make ONE targeted fix and leave everything else exactly as-is.

CURRENT EMAIL BODY:
---
${generatedEmail}
---

${instruction}

${IMMUTABLE_RULES}

Return ONLY the corrected email body. No subject line. No explanation. No "Here is the rewritten email:" prefix. Just the email body text starting with the greeting.`,
          isFirstTouch,
          businessDescription,
        }
      });

      if (error) throw error;

      let fixed = data?.email || data?.body || '';
      // Strip any accidental subject line prefix
      fixed = fixed.replace(/^Subject:\s*.+\n+/i, '').trim();
      // Strip any "Here is the rewritten email:" style preambles
      fixed = fixed.replace(/^(?:here is|here's|below is|the (?:updated|revised|rewritten|fixed) email[:\s]*)\n+/i, '').trim();

      if (fixed) {
        setGeneratedEmail(fixed);
      }
    } catch (err) {
      console.error('Fix failed:', err);
    } finally {
      setFixingCheck(null);
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

      // Pick 3 diverse templates to compare — current + 2 different styles
      // Always include the currently selected template, then pick 2 different categories
      const currentTemplate = EMAIL_TEMPLATES.find(t => t.value === selectedTemplate);
      const otherTemplates = EMAIL_TEMPLATES.filter(t => t.value !== selectedTemplate);

      // Prefer variety: pick one standard and one signal if possible
      const standards = otherTemplates.filter(t => t.category === 'standard');
      const signals = otherTemplates.filter(t => t.category === 'signal');

      const pick = (arr: typeof EMAIL_TEMPLATES) =>
        arr[Math.floor(Math.random() * arr.length)];

      const templateA = currentTemplate || EMAIL_TEMPLATES[0];
      const templateB = standards.length > 0 ? pick(standards) : pick(otherTemplates);
      // For C: pick a signal if we have one and it's not already B, otherwise another standard
      const signalCandidates = signals.filter(t => t.value !== templateB.value);
      const templateC = signalCandidates.length > 0
        ? pick(signalCandidates)
        : pick(otherTemplates.filter(t => t.value !== templateB.value));

      const variantTemplates = [templateA, templateB, templateC];

      const variantPromises = variantTemplates.map(async (tmpl, idx) => {
        // Generate subject
        const { data: subjectData } = await supabase.functions.invoke("generate-email", {
          body: {
            lead,
            tone: emailTone,
            goal: "subject_only",
            templateGoal: tmpl.goal,
            templateDescription: tmpl.description,
            templateValue: tmpl.value,
            triggerContext,
            openerWord: openerWord === "auto" ? "" : openerWord,
            variantNum: idx + 1,
            businessDescription,
          },
        });
        const subject = subjectData?.email?.replace(/^Subject:\s*/i, '').trim() || tmpl.suggestedSubject;

        // Generate body
        const { data: bodyData } = await supabase.functions.invoke("generate-email", {
          body: {
            lead,
            tone: emailTone,
            goal: tmpl.goal,
            templateDescription: tmpl.description,
            templateValue: tmpl.value,
            subjectLine: subject,
            triggerContext,
            openerWord: openerWord === "auto" ? "" : openerWord,
            variantNum: idx + 1,
            businessDescription,
            use4SentenceFramework,
          },
        });

        return {
          id: `variant-${idx + 1}`,
          subject,
          body: sanitizeGeneratedEmailBody(bodyData?.email || ''),
          // Attach label so the picker can show which template each variant used
          label: tmpl.label,
        };
      });

      const variants = await Promise.all(variantPromises);
      setEmailVariants(variants);

      toast({
        title: "3 angles generated",
        description: `${variantTemplates.map(t => t.label).join(' · ')}`,
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

  const selectVariant = async (variant: EmailVariant) => {
    setSubjectLine(variant.subject);
    const senderName = await resolveSenderName();
    setGeneratedEmail(appendSenderLine(sanitizeGeneratedEmailBody(variant.body), senderName));
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

      // Check send-time compliance
      const sendTimeCheck = checkSendTimeCompliance(scheduleDate || new Date());
      if (!sendTimeCheck.isCompliant && !scheduleDate) {
        setSendTimeWarning(sendTimeCheck.reason || "Outside recommended send window");
      } else {
        setSendTimeWarning(null);
      }

      const senderName = await resolveSenderName();
      const fullEmailBody = buildEmailBodyWithSignature(generatedEmail, senderName, undefined, lead.id);
      const quality = scoreEmailQuality(subjectLine, fullEmailBody);

      if (quality.overallStatus === "red") {
        toast({
          title: "Email needs edits before sending",
          description: "This draft has high-risk outbound issues. Tighten the copy and try again.",
          variant: "destructive",
        });
        setIsSending(false);
        return;
      }

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
        jobTitle: lead.job_title,
        industry: lead.industry,
        companyDescription: lead.company_description,
        technologies: lead.technologies,
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
      setDailyEmailsSent(prev => prev + 1);
      
      // Auto-queue follow-up or show suggestion
      setLastSentEmailInfo(sentLeadInfo);
      if (autoQueueFollowUp) {
        // Silently generate and save follow-up as draft
        try {
          const { data: fuData } = await supabase.functions.invoke("generate-followup-suggestion", {
            body: {
              leadId: sentLeadInfo.leadId,
              leadName: sentLeadInfo.leadName,
              companyName: sentLeadInfo.companyName,
              originalSubject: sentLeadInfo.subject,
              jobTitle: sentLeadInfo.jobTitle,
              industry: sentLeadInfo.industry,
            },
          });
          if (fuData) {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase.from('email_drafts').insert({
                user_id: user.id,
                lead_id: sentLeadInfo.leadId,
                subject: `[FU] ${fuData.suggestedSubject || 're: ' + sentLeadInfo.subject}`,
                body: fuData.suggestedBody || '',
                tone: emailTone,
                updated_at: new Date().toISOString(),
              });
              toast({ title: "Follow-up auto-queued to drafts for Day 3" });
              loadCounts();
            }
          }
        } catch (_) {
          // Non-fatal — don't block the send success flow
        }
      } else {
        setShowFollowUpSuggestion(true);
      }
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

      const senderName = await resolveSenderName();
      const fullEmailBody = buildEmailBodyWithSignature(generatedEmail, senderName);

      // Helper: convert plain text lines to HTML, collapsing sign-off + name
      const textLinesToHtml = (text: string) => {
        const lines = text.split('\n');
        const result: string[] = [];
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (!line) { result.push(''); continue; }
          const isSignOff = /^(best(?: regards)?|regards|thanks|thank you|sincerely|cheers)[\s,!.:-]*$/i.test(line);
          if (isSignOff) {
            const block = [line];
            let j = i + 1;
            while (j < lines.length && !lines[j].trim()) j++;
            while (j < lines.length && lines[j].trim()) { block.push(lines[j].trim()); j++; }
            result.push(`<p style="margin:0">${block.join('<br>')}</p>`);
            i = j - 1;
          } else {
            result.push(`<p>${line}</p>`);
          }
        }
        return result.join('\n');
      };

      // Format body as HTML while preserving signature HTML blocks
      const isHtml = fullEmailBody.trim().startsWith('<') &&
        (fullEmailBody.includes('<html') || fullEmailBody.includes('<div') || fullEmailBody.includes('<p') || fullEmailBody.includes('<br'));
      const containsHtml = /<[a-z][\s\S]*>/i.test(fullEmailBody);

      let formattedBody: string;
      if (isHtml) {
        formattedBody = fullEmailBody;
      } else if (containsHtml) {
        const firstHtmlIndex = fullEmailBody.search(/<[a-z][\s\S]*>/i);
        const textPart = fullEmailBody.substring(0, firstHtmlIndex);
        const htmlPart = fullEmailBody.substring(firstHtmlIndex);
        formattedBody = textLinesToHtml(textPart) + '\n' + htmlPart;
      } else {
        formattedBody = textLinesToHtml(fullEmailBody);
      }

      const htmlBody = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}p{margin:0 0 16px}img{max-width:100%;height:auto}</style></head><body>
${formattedBody}
</body></html>`;

      const { error } = await supabase.from("sent_emails").insert({
        user_id: user.id,
        lead_id: selectedLead,
        to_email: lead.contact_email,
        subject: subjectLine,
        body_html: htmlBody,
        body_text: fullEmailBody,
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
    setGeneratedEmail(appendSenderLine(suggestion.suggestedBody, getSenderName()));
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
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-1 sm:mb-2">Outreach Studio</h1>
            <p className="text-muted-foreground text-sm sm:text-base">
              Generate AI-powered cold emails using proven frameworks
            </p>
          </div>
          <div className="flex items-center gap-2">
            <BulkSendDialog
              leads={leads}
              dailyEmailLimit={dailyEmailLimit}
              dailyEmailsSent={dailyEmailsSent}
              connectedAccounts={connectedAccounts}
              selectedSenderId={selectedSenderId}
              emailTone={emailTone}
              openerWord={openerWord}
              businessDescription={businessDescription}
              signature={signature}
              senderName={getSenderName()}
              emailGoal={EMAIL_TEMPLATES.find(t => t.value === selectedTemplate)?.goal || "introduction"}
              templateDescription={EMAIL_TEMPLATES.find(t => t.value === selectedTemplate)?.description || ""}
              templateValue={selectedTemplate || ""}
              complianceSettings={complianceSettings}
              useSpintax={useSpintax}
              onComplete={() => {
                loadCounts();
                loadDailyEmailLimit();
              }}
              onDailyLimitChange={async (newLimit) => {
                await saveDailyLimit(newLimit);
              }}
            />
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
            jobTitle={lastSentEmailInfo.jobTitle}
            industry={lastSentEmailInfo.industry}
            companyDescription={lastSentEmailInfo.companyDescription}
            technologies={lastSentEmailInfo.technologies}
            onSetupFollowUp={handleSetupFollowUp}
            onDismiss={handleDismissFollowUp}
          />
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto scrollbar-hide">
          <TabsList>
            <TabsTrigger value="compose" className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Compose
            </TabsTrigger>
            <TabsTrigger value="sequences" className="flex items-center gap-2">
              <ListOrdered className="w-4 h-4" />
              Sequences
            </TabsTrigger>
            <TabsTrigger value="blocks" className="flex items-center gap-2">
              <Layout className="w-4 h-4" />
              Blocks
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
          </div>

          <TabsContent value="compose" className="mt-6">
            {/* Follow-up due reminders */}
            {dueFollowUps.length > 0 && (
              <div className="mb-4 space-y-2">
                {dueFollowUps.map(fu => {
                  const lead = leads.find(l => l.id === fu.lead_id);
                  return (
                    <div key={fu.id} className="flex items-center justify-between gap-3 px-4 py-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-amber-500 shrink-0">🔔</span>
                        <span className="font-medium text-foreground truncate">
                          Follow-up due{lead ? ` with ${lead.contact_name} (${lead.company_name})` : ""}: <span className="text-muted-foreground font-normal">{fu.subject}</span>
                        </span>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {lead && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => {
                              setSelectedLead(lead.id);
                              setSelectedTemplate("follow_up");
                              dismissFollowUpReminder(fu.id);
                            }}
                          >
                            Compose
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => dismissFollowUpReminder(fu.id)}
                        >
                          Done
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                  <h2 className="text-lg sm:text-xl font-semibold">Email Configuration</h2>
                  <div className="flex items-center gap-2">
                    <EmailTemplateManager
                      currentTemplate={{
                        goal: selectedTemplate ? EMAIL_TEMPLATES.find(t => t.value === selectedTemplate)?.goal : undefined,
                        suggestedSubject: subjectLine,
                        triggerContext,
                      }}
                      onLoadTemplate={(template: UserEmailTemplate) => {
                        if (template.suggested_subject) setSubjectLine(template.suggested_subject);
                        if (template.trigger_context) setTriggerContext(template.trigger_context);
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

                    {/* Domain validation warnings */}
                    {selectedSenderId && (() => {
                      const account = connectedAccounts.find(a => a.id === selectedSenderId);
                      if (!account) return null;
                      const validation = validateSenderDomain(account.email);
                      if (!validation.isPersonal) return null;
                      return (
                        <div className="mt-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                          <div className="flex items-start gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                            <div className="text-amber-800">
                              <p className="font-medium">Personal email detected</p>
                              <ul className="list-disc list-inside mt-1 space-y-0.5">
                                {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
                              </ul>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Send time compliance warning */}
                  {sendTimeWarning && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded flex items-start gap-2">
                      <Clock className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <p className="text-xs text-yellow-800">{sendTimeWarning}</p>
                    </div>
                  )}

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

                    {/* Lead profile card — shows what the AI will personalize with */}
                    {selectedLead && (() => {
                      const lead = leads.find(l => l.id === selectedLead);
                      if (!lead) return null;
                      const tags = [
                        lead.job_title,
                        lead.industry,
                        lead.seniority,
                        lead.company_size || lead.employee_count,
                      ].filter(Boolean);
                      const techs = lead.technologies?.slice(0, 3) || [];
                      return (
                        <div className="mt-2 p-3 rounded-lg border border-border/40 bg-muted/20 space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI will personalize using</p>
                          <div className="flex flex-wrap gap-1.5">
                            {tags.map((tag, i) => (
                              <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-primary/10 text-primary font-medium">{tag}</span>
                            ))}
                            {techs.map((tech, i) => (
                              <span key={`t${i}`} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-secondary/60 text-foreground/70">{tech}</span>
                            ))}
                            {lead.icp_score > 0 && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-green-500/10 text-green-600 font-medium">ICP {lead.icp_score}/100</span>
                            )}
                          </div>
                          {lead.company_description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">{lead.company_description}</p>
                          )}
                          {lead.notes && (
                            <p className="text-xs text-amber-600/80 line-clamp-1">📝 {lead.notes}</p>
                          )}
                          {tags.length === 0 && techs.length === 0 && (
                            <p className="text-xs text-amber-600">⚠️ Limited lead data — enrich this lead for better personalization</p>
                          )}
                        </div>
                      );
                    })()}
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
                        <SelectGroup>
                          <SelectLabel>— Standard —</SelectLabel>
                          {EMAIL_TEMPLATES.filter(t => t.category === "standard").map((template) => (
                            <SelectItem key={template.value} value={template.value}>
                              <div className="flex flex-col">
                                <span>{template.label}</span>
                                <span className="text-xs text-muted-foreground">{template.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                        <SelectGroup>
                          <SelectLabel>— Intent Signals —</SelectLabel>
                          {EMAIL_TEMPLATES.filter(t => t.category === "signal").map((template) => (
                            <SelectItem key={template.value} value={template.value}>
                              <div className="flex flex-col">
                                <span className="flex items-center gap-1">
                                  <span>⚡</span>
                                  {template.label}
                                </span>
                                <span className="text-xs text-muted-foreground">{template.description}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* P0.1 — First touch toggle */}
                  <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
                    <div>
                      <p className="text-sm font-medium">
                        {isFirstTouch ? "First touch (plain text)" : "Warm follow-up (HTML allowed)"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {isFirstTouch ? "Strips HTML from signature — better inbox placement" : "HTML signature allowed for warm sequences"}
                      </p>
                    </div>
                    <Switch
                      checked={!isFirstTouch}
                      onCheckedChange={(v) => setIsFirstTouch(!v)}
                    />
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
                      Your Business
                      <Badge variant="outline" className="ml-2 text-xs">Saved</Badge>
                    </Label>
                    <Textarea
                      value={businessDescription}
                      onChange={(e) => handleBusinessDescriptionChange(e.target.value)}
                      placeholder="e.g., We're an AI-powered revenue operations platform that helps B2B sales teams consolidate prospecting, enrichment, and outreach into one tool..."
                      className="min-h-[80px]"
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Describe what your company does so AI generates emails with real info
                    </p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label>Subject Line</Label>
                      {subjectLine && (() => {
                        const lead = leads.find(l => l.id === selectedLead);
                        const { score, flags } = scoreSubjectLine(subjectLine, lead);
                        const color = score >= 80 ? "bg-green-500/15 text-green-700 dark:text-green-400" : score >= 50 ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400" : "bg-destructive/15 text-destructive";
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium cursor-default ${color}`}>
                                  {score}/100
                                </span>
                              </TooltipTrigger>
                              {flags.length > 0 && (
                                <TooltipContent>
                                  <ul className="text-xs space-y-0.5">
                                    {flags.slice(0, 2).map((f, i) => <li key={i}>• {f}</li>)}
                                  </ul>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </div>
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
                    <div className="flex items-center justify-center gap-2">
                      <Switch
                        id="framework-toggle"
                        checked={use4SentenceFramework}
                        onCheckedChange={setUse4SentenceFramework}
                      />
                      <label htmlFor="framework-toggle" className="text-xs text-muted-foreground cursor-pointer select-none">
                        {use4SentenceFramework
                          ? "4-sentence framework (observation → pain → solution → CTA)"
                          : "Template-specific structure • Click shuffle for A/B testing"}
                      </label>
                    </div>
                    {/* P1.2 — Auto-queue follow-up */}
                    <div className="flex items-center justify-center gap-2">
                      <Switch
                        id="auto-followup-toggle"
                        checked={autoQueueFollowUp}
                        onCheckedChange={setAutoQueueFollowUp}
                      />
                      <label htmlFor="auto-followup-toggle" className="text-xs text-muted-foreground cursor-pointer select-none">
                        {autoQueueFollowUp ? "Auto-queue follow-up (saves to drafts on send)" : "Auto-queue follow-up"}
                      </label>
                    </div>
                    {!businessDescription && selectedLead && (
                      <p className="text-xs text-amber-600 text-center">
                        ⚠️ Add your business description above for stronger personalization and social proof
                      </p>
                    )}
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
                        <h3 className="font-semibold text-sm">3 angles — pick the best one</h3>
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
                          <span className="text-sm text-muted-foreground">Generating 3 different angles...</span>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {emailVariants.map((variant, index) => (
                            <div
                              key={variant.id}
                              className="p-3 border rounded-lg bg-background hover:border-primary cursor-pointer transition-colors group"
                              onClick={() => selectVariant(variant)}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                                      {String.fromCharCode(65 + index)}
                                    </Badge>
                                    {variant.label && (
                                      <span className="text-[10px] text-muted-foreground/70 truncate">
                                        {variant.label}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm font-medium truncate">{variant.subject}</p>
                                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                    {variant.body.slice(0, 130)}...
                                  </p>
                                </div>
                                <Button variant="ghost" size="icon" className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
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

                  {/* P0.1 — First touch HTML signature warning */}
                  {isFirstTouch && signature && /<[a-z]/i.test(signature) && (
                    <Alert className="border-yellow-500/40 bg-yellow-500/10">
                      <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                      <AlertDescription className="text-yellow-700 dark:text-yellow-400 text-xs">
                        First-touch plain text mode — HTML signature stripped. Keeps you out of promotions tab.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Spintax toggle */}
                  <div className="flex items-center justify-between p-2 border rounded-lg">
                    <div className="flex items-center gap-2">
                      <Shuffle className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Spintax Variation</p>
                        <p className="text-xs text-muted-foreground">
                          Randomize phrasing {"Hi|Hello|Hey"} to avoid pattern detection
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={useSpintax}
                      onCheckedChange={setUseSpintax}
                    />
                  </div>

                  <div>
                    {/* P3.1 — Desktop/Mobile preview toggle */}
                    <div className="flex items-center justify-between mb-1.5">
                      <Label>Email Body</Label>
                      <div className="flex items-center gap-1 rounded-md border p-0.5">
                        <Button
                          variant={previewMode === "desktop" ? "secondary" : "ghost"}
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setPreviewMode("desktop")}
                        >
                          <Monitor className="w-3 h-3 mr-1" />
                          Desktop
                        </Button>
                        <Button
                          variant={previewMode === "mobile" ? "secondary" : "ghost"}
                          size="sm"
                          className="h-6 px-2 text-xs"
                          onClick={() => setPreviewMode("mobile")}
                        >
                          <Smartphone className="w-3 h-3 mr-1" />
                          Mobile
                        </Button>
                      </div>
                    </div>

                    {previewMode === "mobile" && generatedEmail ? (
                      <div className="flex justify-center bg-gray-900 rounded-xl p-4">
                        {/* iPhone mock frame */}
                        <div className="relative w-[375px]">
                          {/* Notch bar */}
                          <div className="bg-gray-800 rounded-t-2xl h-6 flex items-center justify-center">
                            <div className="w-16 h-3 bg-gray-700 rounded-full" />
                          </div>
                          {/* Screen */}
                          <div
                            className="bg-white dark:bg-gray-100 rounded-b-2xl p-4 border border-gray-700 overflow-auto"
                            style={{ maxHeight: '400px', fontSize: '14px', lineHeight: '1.5', color: '#333' }}
                          >
                            <div
                              dangerouslySetInnerHTML={{
                                __html: DOMPurify.sanitize(generatedEmail.replace(/\n/g, '<br/>'))
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    ) : (
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
                    )}
                  </div>
                  {generatedEmail && (
                    <div className="space-y-3">
                      <EmailQualityChecker
                        subject={subjectLine}
                        body={generatedEmail}
                        isFirstTouch={isFirstTouch}
                        onFix={handleQualityFix}
                        fixingCheck={fixingCheck}
                      />
                      <div className="flex gap-2">
                        <Button
                          className="flex-1"
                          onClick={sendEmail}
                          disabled={isSending || isScheduling || dailyEmailsSent >= dailyEmailLimit}
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
                      {/* P2.2 — Send-time intelligence hint */}
                      {selectedLead && (() => {
                        const lead = leads.find(l => l.id === selectedLead);
                        if (!lead) return null;
                        return (
                          <p className="text-xs text-muted-foreground mt-1">
                            {getBestSendTime(lead)}
                          </p>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="sent" className="mt-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Sent Emails</h2>
              <SentEmailsTable onDeleted={loadCounts} />
            </Card>
          </TabsContent>

          <TabsContent value="drafts" className="mt-6">
            <Card className="p-6">
              <h2 className="text-xl font-semibold mb-4">Email Drafts</h2>
              <EmailDraftsTable onLoadDraft={loadDraft} />
            </Card>
          </TabsContent>

          <TabsContent value="sequences" className="mt-6">
            <SequencesList />
          </TabsContent>

          <TabsContent value="blocks" className="mt-6">
            <MessageBlocksList />
          </TabsContent>

          <TabsContent value="performance" className="mt-6">
            <div className="space-y-4">
              {/* P3.3 / P4.3 — Open tracking warning */}
              <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-sm">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Open tracking pixels can hurt cold email deliverability. <strong>Reply rate</strong> is your real metric — use opens as directional only.</span>
              </div>
              <EmailPerformanceStats />
              <p className="text-xs text-muted-foreground text-center">Focus on reply rate as your primary metric.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Outreach;
