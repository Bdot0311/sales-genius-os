import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Send, Sparkles, Users, Search } from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";

interface Lead {
  id: string;
  contact_name: string;
  company_name: string;
  contact_email: string | null;
  job_title: string | null;
  industry: string | null;
}

interface BulkSendDialogProps {
  leads: Lead[];
  dailyEmailLimit: number;
  dailyEmailsSent: number;
  connectedAccounts: Array<{ id: string; email: string }>;
  selectedSenderId: string;
  emailTone: string;
  openerWord: string;
  businessDescription: string;
  signature: string;
  senderName: string;
  onComplete: () => void;
}

export const BulkSendDialog = ({
  leads,
  dailyEmailLimit,
  dailyEmailsSent,
  connectedAccounts,
  selectedSenderId,
  emailTone,
  openerWord,
  businessDescription,
  signature,
  senderName,
  onComplete,
}: BulkSendDialogProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [sendMode, setSendMode] = useState<"generate" | "same">("generate");
  const [sameSubject, setSameSubject] = useState("");
  const [sameBody, setSameBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [progress, setProgress] = useState({ sent: 0, failed: 0, total: 0 });
  const [searchQuery, setSearchQuery] = useState("");
  const [bulkSenderId, setBulkSenderId] = useState<string>("all");

  const remaining = dailyEmailLimit - dailyEmailsSent;
  const emailableLeads = leads.filter((l) => l.contact_email);
  const filteredLeads = emailableLeads.filter(
    (l) =>
      l.contact_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      l.company_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < remaining) next.add(id);
      else {
        toast({
          title: "Daily limit reached",
          description: `You can only send ${remaining} more emails today`,
          variant: "destructive",
        });
      }
      return next;
    });
  };

  const selectAll = () => {
    const toSelect = filteredLeads.slice(0, remaining).map((l) => l.id);
    setSelectedLeadIds(new Set(toSelect));
  };

  const deselectAll = () => setSelectedLeadIds(new Set());

  const appendSenderLine = (body: string) => {
    if (!senderName) return body;
    const trimmed = body.trimEnd();
    const signOffRegex = /^(best(?: regards)?|regards|thanks|thank you|sincerely|cheers)[\s,!.:-]*$/im;
    if (signOffRegex.test(trimmed.split('\n').pop()?.trim() || '')) {
      return `${trimmed}\n${senderName}`;
    }
    return trimmed;
  };

  const buildBodyWithSignature = (body: string) => {
    const withSender = appendSenderLine(body);
    const signatureForEmail = signature
      .replace(/width=["']150["']/gi, 'width="320"')
      .replace(/max-width:\s*150px/gi, 'max-width:320px');
    return signatureForEmail ? `${withSender}\n\n${signatureForEmail}` : withSender;
  };

  const bulkSend = async () => {
    if (selectedLeadIds.size === 0) return;
    if (connectedAccounts.length === 0) {
      toast({ title: "No email accounts connected", variant: "destructive" });
      return;
    }

    setIsSending(true);
    const selectedLeads = leads.filter((l) => selectedLeadIds.has(l.id));
    setProgress({ sent: 0, failed: 0, total: selectedLeads.length });

    let sent = 0;
    let failed = 0;

    for (const lead of selectedLeads) {
      try {
        let subject = sameSubject;
        let body = sameBody;

        if (sendMode === "generate") {
          // Generate unique subject
          const { data: subData, error: subErr } = await supabase.functions.invoke("generate-email", {
            body: {
              lead,
              tone: emailTone,
              goal: "subject_only",
              openerWord: openerWord === "auto" ? "" : openerWord,
              businessDescription,
            },
          });
          if (subErr) throw subErr;
          subject = subData.email.replace(/^Subject:\s*/i, "").trim();

          // Generate unique body
          const { data: bodyData, error: bodyErr } = await supabase.functions.invoke("generate-email", {
            body: {
              lead,
              tone: emailTone,
              goal: "custom",
              subjectLine: subject,
              openerWord: openerWord === "auto" ? "" : openerWord,
              businessDescription,
            },
          });
          if (bodyErr) throw bodyErr;
          body = bodyData.email;
        } else {
          // Personalize same template with lead name/company
          subject = subject
            .replace(/\{name\}/gi, lead.contact_name?.split(" ")[0] || "there")
            .replace(/\{company\}/gi, lead.company_name || "your company");
          body = body
            .replace(/\{name\}/gi, lead.contact_name?.split(" ")[0] || "there")
            .replace(/\{company\}/gi, lead.company_name || "your company")
            .replace(/\{full_name\}/gi, lead.contact_name || "there")
            .replace(/\{job_title\}/gi, lead.job_title || "");
        }

        const fullBody = buildBodyWithSignature(body);
        // Round-robin across accounts or use selected one
        let senderAccountId: string;
        if (bulkSenderId === "all" && connectedAccounts.length > 0) {
          const idx = selectedLeads.indexOf(lead) % connectedAccounts.length;
          senderAccountId = connectedAccounts[idx].id;
        } else {
          senderAccountId = bulkSenderId !== "all" ? bulkSenderId : (selectedSenderId || connectedAccounts[0]?.id);
        }

        const { error } = await supabase.functions.invoke("send-email", {
          body: {
            to: lead.contact_email,
            subject,
            body: fullBody,
            integrationId: "google",
            integrationRowId: senderAccountId,
            leadId: lead.id,
          },
        });

        if (error) throw error;
        sent++;
      } catch (err: any) {
        console.error(`Failed to send to ${lead.contact_name}:`, err);
        failed++;
      }

      setProgress({ sent, failed, total: selectedLeads.length });
    }

    setIsSending(false);
    toast({
      title: "Bulk send complete",
      description: `${sent} sent, ${failed} failed out of ${selectedLeads.length}`,
    });

    if (sent > 0) {
      onComplete();
      setSelectedLeadIds(new Set());
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="w-4 h-4 mr-2" />
          Bulk Send
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Bulk Email Send
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Daily limit info */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
            <span className="text-sm text-muted-foreground">
              Remaining today: <span className="font-semibold text-foreground">{remaining}</span> / {dailyEmailLimit}
            </span>
            <Badge variant={remaining > 0 ? "secondary" : "destructive"}>
              {selectedLeadIds.size} selected
            </Badge>
          </div>

          {/* Send From selector */}
          {connectedAccounts.length > 1 && (
            <div>
              <Label className="text-sm font-medium mb-2 block">Send From</Label>
              <Select value={bulkSenderId} onValueChange={setBulkSenderId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select sender" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts (round-robin)</SelectItem>
                  {connectedAccounts.map((acc) => (
                    <SelectItem key={acc.id} value={acc.id}>{acc.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {bulkSenderId === "all" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Emails will be distributed evenly across all {connectedAccounts.length} connected accounts
                </p>
              )}
            </div>
          )}

          {/* Send mode */}
          <div>
            <Label className="text-sm font-medium mb-2 block">Send Mode</Label>
            <RadioGroup value={sendMode} onValueChange={(v) => setSendMode(v as "generate" | "same")} className="flex gap-4">
              <div className="flex items-center gap-2 p-3 border rounded-lg flex-1 cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value="generate" id="mode-generate" />
                <label htmlFor="mode-generate" className="cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                    <span className="text-sm font-medium">AI-Generated</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">Unique personalized email per lead</p>
                </label>
              </div>
              <div className="flex items-center gap-2 p-3 border rounded-lg flex-1 cursor-pointer hover:bg-muted/30">
                <RadioGroupItem value="same" id="mode-same" />
                <label htmlFor="mode-same" className="cursor-pointer">
                  <div className="flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-primary" />
                    <span className="text-sm font-medium">Same Template</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{"Use {name}, {company}, {job_title}"}</p>
                </label>
              </div>
            </RadioGroup>
          </div>

          {/* Same template inputs */}
          {sendMode === "same" && (
            <div className="space-y-2">
              <div>
                <Label className="text-xs">Subject</Label>
                <Input
                  value={sameSubject}
                  onChange={(e) => setSameSubject(e.target.value)}
                  placeholder="e.g., Quick question for {name} at {company}"
                />
              </div>
              <div>
                <Label className="text-xs">Body</Label>
                <Textarea
                  value={sameBody}
                  onChange={(e) => setSameBody(e.target.value)}
                  placeholder={"Hi {name},\n\nI noticed {company} is growing fast...\n\nWorth a quick look?\n\nBest,"}
                  className="min-h-[120px]"
                />
              </div>
            </div>
          )}

          {/* Lead selector */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm">Select Leads ({emailableLeads.length} with email)</Label>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
                  Select All
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-9"
              />
            </div>
            <ScrollArea className="flex-1 max-h-[200px] border rounded-lg">
              <div className="p-2 space-y-1">
                {filteredLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleLead(lead.id)}
                  >
                    <Checkbox checked={selectedLeadIds.has(lead.id)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{lead.contact_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {lead.company_name} · {lead.contact_email}
                      </p>
                    </div>
                  </div>
                ))}
                {filteredLeads.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">No leads with email found</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Progress */}
          {isSending && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Sending...</span>
                <span className="font-medium">
                  {progress.sent + progress.failed} / {progress.total}
                </span>
              </div>
              <Progress value={((progress.sent + progress.failed) / Math.max(progress.total, 1)) * 100} />
              <div className="flex gap-3 text-xs">
                <span className="text-green-600">✓ {progress.sent} sent</span>
                {progress.failed > 0 && <span className="text-destructive">✗ {progress.failed} failed</span>}
              </div>
            </div>
          )}

          {/* Send button */}
          <Button
            className="w-full"
            onClick={bulkSend}
            disabled={
              isSending ||
              selectedLeadIds.size === 0 ||
              remaining <= 0 ||
              (sendMode === "same" && (!sameSubject || !sameBody))
            }
          >
            {isSending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Sending {progress.sent + progress.failed}/{progress.total}...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Send to {selectedLeadIds.size} {selectedLeadIds.size === 1 ? "Lead" : "Leads"}
                {sendMode === "generate" && <Sparkles className="w-3.5 h-3.5 ml-1.5" />}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
