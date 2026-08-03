import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Plus, Trash2, Loader2, Save } from "lucide-react";
import type { AgentConfig } from "@/pages/Agent";
import { ProspectingSourceHelper, type ICPSnapshot } from "@/components/agent/ProspectingSourceHelper";
import { ObjectionLibrary } from "@/components/agent/ObjectionLibrary";


interface ConfigTabProps {
  config: AgentConfig | null;
  userId: string | null;
  onSaved: (config: AgentConfig) => void;
}

const OBJECTION_PRESETS = [
  { key: "too_expensive", label: "Too expensive" },
  { key: "not_right_time", label: "Not the right time" },
  { key: "have_solution", label: "Already have a solution" },
  { key: "need_to_think", label: "Need to think about it" },
];

const TONE_OPTIONS = [
  { value: "professional", label: "Professional" },
  { value: "friendly", label: "Friendly" },
  { value: "direct", label: "Direct" },
  { value: "casual", label: "Casual" },
];

export function ConfigTab({ config, userId, onSaved }: ConfigTabProps) {
  const [agentName, setAgentName] = useState("");
  const [persona, setPersona] = useState("");
  const [tone, setTone] = useState("professional");
  const [companyContext, setCompanyContext] = useState("");
  const [valueProps, setValueProps] = useState<string[]>([""]);
  const [objectionResponses, setObjectionResponses] = useState<
    Record<string, string>
  >({});
  const [autoReplyInterested, setAutoReplyInterested] = useState(false);
  const [autoHandleObjections, setAutoHandleObjections] = useState(false);
  const [autoBookMeetings, setAutoBookMeetings] = useState(false);
  const [calendlyUrl, setCalendlyUrl] = useState("");
  const [canFindLeads, setCanFindLeads] = useState(false);
  const [canSendOutreach, setCanSendOutreach] = useState(false);
  const [prospectJobTitle, setProspectJobTitle] = useState("");
  const [prospectIndustry, setProspectIndustry] = useState("");
  const [prospectCountry, setProspectCountry] = useState("");
  const [prospectCompanySize, setProspectCompanySize] = useState("");
  const [dailyLeadTarget, setDailyLeadTarget] = useState("10");
  const [maxDailyNewEmails, setMaxDailyNewEmails] = useState("20");
  const [icpSnapshot, setIcpSnapshot] = useState<ICPSnapshot | null>(null);
  const [icpProfileId, setIcpProfileId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Populate form from config
  useEffect(() => {
    if (!config) return;
    setAgentName(config.agent_name ?? "");
    setPersona(config.persona ?? "");
    setTone(config.tone ?? "professional");
    setCompanyContext(config.company_context ?? "");
    setValueProps(
      config.value_props && config.value_props.length > 0
        ? config.value_props
        : [""]
    );
    setObjectionResponses(config.objection_responses ?? {});
    setAutoReplyInterested(config.can_reply_interested ?? false);
    setAutoHandleObjections(config.can_handle_objections ?? false);
    setAutoBookMeetings(config.can_book_meetings ?? false);
    setCalendlyUrl(config.calendly_url ?? "");
    setCanFindLeads(config.can_find_leads ?? false);
    setCanSendOutreach(config.can_send_outreach ?? false);
    setProspectJobTitle(config.prospecting_job_title ?? "");
    setProspectIndustry(config.prospecting_industry ?? "");
    setProspectCountry(config.prospecting_country ?? "");
    setProspectCompanySize(config.prospecting_company_size ?? "");
    setIcpSnapshot((config.icp_snapshot as ICPSnapshot | null) ?? null);
    setIcpProfileId(config.icp_profile_id ?? null);
    setDailyLeadTarget(String(config.daily_lead_target ?? 10));
    setMaxDailyNewEmails(String(config.max_daily_new_emails ?? 20));
  }, [config]);

  const handleAddValueProp = () => {
    setValueProps((prev) => [...prev, ""]);
  };

  const handleValuePropChange = (index: number, value: string) => {
    setValueProps((prev) => {
      const updated = [...prev];
      updated[index] = value;
      return updated;
    });
  };

  const handleRemoveValueProp = (index: number) => {
    setValueProps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleObjectionChange = (key: string, value: string) => {
    setObjectionResponses((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!userId) {
      toast.error("Not authenticated");
      return;
    }
    setSaving(true);
    try {
      const filteredValueProps = valueProps.filter((v) => v.trim().length > 0);
      const payload: Record<string, unknown> = {
        user_id: userId,
        agent_name: agentName.trim() || null,
        persona: persona.trim() || null,
        tone,
        company_context: companyContext.trim() || null,
        value_props: filteredValueProps.length > 0 ? filteredValueProps : null,
        objection_responses:
          Object.keys(objectionResponses).length > 0
            ? objectionResponses
            : null,
        can_reply_interested: autoReplyInterested,
        can_handle_objections: autoHandleObjections,
        can_book_meetings: autoBookMeetings,
        calendly_url: autoBookMeetings ? (calendlyUrl.trim() || null) : null,
        can_find_leads: canFindLeads,
        can_send_outreach: canSendOutreach,
        prospecting_job_title: prospectJobTitle.trim() || null,
        prospecting_industry: prospectIndustry.trim() || null,
        prospecting_country: prospectCountry.trim() || null,
        prospecting_company_size: prospectCompanySize.trim() || null,
        icp_profile_id: icpProfileId,
        icp_snapshot: icpSnapshot,
        daily_lead_target: Math.min(Math.max(Number(dailyLeadTarget) || 10, 1), 25),
        max_daily_new_emails: Math.min(Math.max(Number(maxDailyNewEmails) || 20, 0), 100),
      };
      if (config?.id) payload.id = config.id;

      const { data, error } = await (supabase as any)
        .from("agent_configs")
        .upsert(payload, { onConflict: "id" })
        .select("*")
        .maybeSingle();

      if (error) throw error;
      onSaved(data as AgentConfig);
      toast.success("Configuration saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Identity */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Agent Identity
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="agent-name">Agent Name</Label>
            <Input
              id="agent-name"
              placeholder='e.g. "Alex"'
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="persona">Persona</Label>
            <Textarea
              id="persona"
              placeholder="Professional, consultative, helpful. Focused on understanding the prospect's challenges before pitching."
              rows={4}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tone">Tone</Label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger id="tone">
                <SelectValue placeholder="Select tone" />
              </SelectTrigger>
              <SelectContent>
                {TONE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="company-context">Company Context</Label>
            <Textarea
              id="company-context"
              placeholder="We help B2B SaaS companies increase pipeline by 3x using AI-powered outbound..."
              rows={3}
              value={companyContext}
              onChange={(e) => setCompanyContext(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Lead generation */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Lead Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Find new leads automatically</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Each run the agent sources fresh prospects matching your targeting below
              </p>
            </div>
            <Switch
              checked={canFindLeads}
              onCheckedChange={setCanFindLeads}
              aria-label="Auto find leads"
            />
          </div>

          {canFindLeads && (
            <>
            <ProspectingSourceHelper
              currentSnapshot={icpSnapshot}
              onApply={(t, snapshot) => {
                if (t.jobTitle) setProspectJobTitle(t.jobTitle);
                if (t.industry) setProspectIndustry(t.industry);
                if (t.country) setProspectCountry(t.country);
                if (t.companySize) setProspectCompanySize(t.companySize);
                setIcpSnapshot(snapshot);
                setIcpProfileId(snapshot.profile_id);
              }}
            />
            {icpSnapshot && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    ICP linked: {icpSnapshot.name}
                    {config?.icp_snapshot ? "" : " (unsaved — hit Save)"}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIcpSnapshot(null);
                      setIcpProfileId(null);
                    }}
                  >
                    Unlink
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    icpSnapshot.target_titles.length ? `${icpSnapshot.target_titles.length} titles` : null,
                    icpSnapshot.industries.length ? `${icpSnapshot.industries.length} industries` : null,
                    icpSnapshot.pain_points.length ? `${icpSnapshot.pain_points.length} pain points` : null,
                    icpSnapshot.buying_signals.length ? `${icpSnapshot.buying_signals.length} buying signals` : null,
                    icpSnapshot.exclude_titles.length || icpSnapshot.exclude_industries.length
                      ? "exclusions"
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Full profile stored"}
                  {" — the agent uses this full context on every run."}
                </p>
                <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 pt-2 text-xs">
                  {[
                    { label: "Job title", value: prospectJobTitle },
                    { label: "Industry", value: prospectIndustry },
                    { label: "Country", value: prospectCountry },
                    { label: "Company size", value: prospectCompanySize },
                  ].map((f) => (
                    <div key={f.label} className="flex justify-between gap-2">
                      <span className="text-muted-foreground">{f.label}</span>
                      <span className="font-medium text-right truncate">
                        {f.value || "Any"}
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground pt-1">
                  Search filters are imported from this profile. Unlink to edit them manually.
                </p>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 pt-1">
              {!icpSnapshot && (
                <>
              <div className="space-y-1.5">
                <Label htmlFor="p-title">Job title</Label>
                <Input
                  id="p-title"
                  placeholder="e.g. Head of Sales"
                  value={prospectJobTitle}
                  onChange={(e) => setProspectJobTitle(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-industry">Industry</Label>
                <Input
                  id="p-industry"
                  placeholder="e.g. SaaS"
                  value={prospectIndustry}
                  onChange={(e) => setProspectIndustry(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-country">Country</Label>
                <Input
                  id="p-country"
                  placeholder="e.g. United States"
                  value={prospectCountry}
                  onChange={(e) => setProspectCountry(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="p-size">Company size</Label>
                <Input
                  id="p-size"
                  placeholder="e.g. 11-50"
                  value={prospectCompanySize}
                  onChange={(e) => setProspectCompanySize(e.target.value)}
                />
              </div>
                </>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="p-target">New leads per run</Label>
                <Input
                  id="p-target"
                  type="number"
                  min={1}
                  max={25}
                  value={dailyLeadTarget}
                  onChange={(e) => setDailyLeadTarget(e.target.value)}
                />
              </div>
            </div>

            </>
          )}

        </CardContent>
      </Card>

      {/* Outreach sending */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Outreach Sending
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Send first-touch emails</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                The agent writes and sends the opening email to uncontacted leads from your Gmail
              </p>
            </div>
            <Switch
              checked={canSendOutreach}
              onCheckedChange={setCanSendOutreach}
              aria-label="Auto send outreach"
            />
          </div>
          {canSendOutreach && (
            <div className="space-y-1.5 pt-1 max-w-xs">
              <Label htmlFor="p-max-emails">Max new emails per day</Label>
              <Input
                id="p-max-emails"
                type="number"
                min={0}
                max={100}
                value={maxDailyNewEmails}
                onChange={(e) => setMaxDailyNewEmails(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Value Propositions */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Value Propositions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {valueProps.map((vp, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                placeholder={`Value prop ${i + 1}`}
                value={vp}
                onChange={(e) => handleValuePropChange(i, e.target.value)}
                className="flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveValueProp(i)}
                disabled={valueProps.length === 1}
                className="text-muted-foreground hover:text-destructive flex-shrink-0"
                aria-label="Remove value proposition"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddValueProp}
            className="gap-2 mt-1"
          >
            <Plus className="w-4 h-4" />
            Add Value Prop
          </Button>
        </CardContent>
      </Card>

      {/* Objection Handling */}
      <ObjectionLibrary />

      {/* Auto-reply settings */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Reply Handling
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Reply to interested prospects</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically send follow-up when a prospect expresses interest
              </p>
            </div>
            <Switch
              checked={autoReplyInterested}
              onCheckedChange={setAutoReplyInterested}
              aria-label="Auto reply to interested"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Handle objections automatically</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use configured responses to address common objections
              </p>
            </div>
            <Switch
              checked={autoHandleObjections}
              onCheckedChange={setAutoHandleObjections}
              aria-label="Auto handle objections"
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Book meetings automatically</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Send Calendly link when prospect requests a meeting
              </p>
            </div>
            <Switch
              checked={autoBookMeetings}
              onCheckedChange={setAutoBookMeetings}
              aria-label="Auto book meetings"
            />
          </div>

          {autoBookMeetings && (
            <div className="space-y-1.5 pt-1">
              <Label htmlFor="calendly-url">Calendly URL</Label>
              <Input
                id="calendly-url"
                placeholder="https://calendly.com/your-link"
                value={calendlyUrl}
                onChange={(e) => setCalendlyUrl(e.target.value)}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Save */}
      <div className="flex justify-end pb-4">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Saving…" : "Save Configuration"}
        </Button>
      </div>
    </div>
  );
}
