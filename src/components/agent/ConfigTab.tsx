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
      };
      if (config?.id) payload.id = config.id;

      const { data, error } = await (supabase as any)
        .from("agent_configs")
        .upsert(payload, { onConflict: "user_id" })
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
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Objection Handling
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="space-y-1">
            {OBJECTION_PRESETS.map((obj) => (
              <AccordionItem
                key={obj.key}
                value={obj.key}
                className="border border-border/40 rounded-lg px-3 overflow-hidden"
              >
                <AccordionTrigger className="text-sm font-medium py-3 hover:no-underline">
                  {obj.label}
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  <Textarea
                    placeholder={`How should the agent respond when a prospect says "${obj.label.toLowerCase()}"?`}
                    rows={3}
                    value={objectionResponses[obj.key] ?? ""}
                    onChange={(e) =>
                      handleObjectionChange(obj.key, e.target.value)
                    }
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </CardContent>
      </Card>

      {/* Auto-reply settings */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Auto-Reply Settings
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
