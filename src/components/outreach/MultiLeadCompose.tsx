import DOMPurify from "dompurify";
import { Wand2, Loader2, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { emptyComposeDraft, type ComposeDrafts, type LeadComposeDraft } from "@/lib/outreach-compose-state";

interface ComposeLead {
  id: string;
  contact_name?: string | null;
  company_name?: string | null;
  contact_email?: string | null;
}

interface Props {
  leads: ComposeLead[];
  drafts: ComposeDrafts;
  activeLeadId: string;
  onSelect: (id: string) => void;
  onChange: (id: string, patch: Partial<LeadComposeDraft>) => void;
}

const name = (lead: ComposeLead) => [lead.contact_name, lead.company_name].filter(Boolean).join(" · ") || lead.contact_email || "Unnamed lead";

export function MultiLeadFields({ leads, drafts, activeLeadId, onSelect, onChange, field, generating, onGenerate }: Props & {
  field: "trigger" | "subject";
  generating: boolean;
  onGenerate: (id: string) => void;
}) {
  const title = field === "trigger" ? "Trigger/Context" : "Subject line";
  return (
    <div className="space-y-3">
      <Label className="text-[0.8125rem] font-medium text-foreground">{title} <span className="text-muted-foreground">({leads.length})</span></Label>
      <div className="max-h-[360px] space-y-3 overflow-y-auto pr-1">
        {leads.map((lead, index) => (
          <div key={lead.id} className="space-y-1">
            <Label htmlFor={`${field}-${lead.id}`} className={cn("block truncate text-xs", activeLeadId === lead.id ? "text-primary" : "text-muted-foreground")}>{index + 1}. {name(lead)}</Label>
            <div className="flex gap-2">
              <Input id={`${field}-${lead.id}`} aria-label={`${title} for ${name(lead)}`} value={(drafts[lead.id] ?? emptyComposeDraft)[field]} onFocus={() => onSelect(lead.id)} onChange={(event) => onChange(lead.id, { [field]: event.target.value })} maxLength={field === "trigger" ? 300 : 200} placeholder={field === "trigger" ? "Add researched context…" : "Enter subject line…"} className="min-w-0 flex-1" />
              <Button variant="outline" size="icon" disabled={generating} onClick={() => { onSelect(lead.id); onGenerate(lead.id); }} aria-label={`Generate ${field === "trigger" ? "trigger context" : "subject line"} for ${name(lead)}`} className="shrink-0">
                {generating && activeLeadId === lead.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MultiLeadEmails({ leads, drafts, activeLeadId, onSelect, onChange, mode, generating, generatingLeadId, onGenerate }: Props & {
  mode: "desktop" | "mobile";
  generating: boolean;
  generatingLeadId: string | null;
  onGenerate: (id: string) => void;
}) {
  return (
    <div className="max-h-[900px] space-y-4 overflow-y-auto pr-1" aria-label="Selected lead email previews">
      {leads.map((lead, index) => {
        const draft = drafts[lead.id] ?? emptyComposeDraft;
        const active = activeLeadId === lead.id;
        return (
          <article key={lead.id} aria-label={`Email for ${name(lead)}`} className={cn("min-w-0 rounded-lg border bg-muted/20", active ? "border-primary/60" : "border-border/60")}>
            <div className="flex items-start justify-between gap-2 border-b border-border/40 p-3">
              <div className="min-w-0">
                <h3 className="break-words text-sm font-medium text-foreground">{index + 1}. {name(lead)}</h3>
                <p className="break-all text-xs text-muted-foreground">{lead.contact_email || "No email address"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="outline" className="h-7 w-7" disabled={generating} onClick={() => { onSelect(lead.id); onGenerate(lead.id); }} aria-label={`${draft.body ? "Regenerate" : "Generate"} email for ${name(lead)}`}>
                        {generating && generatingLeadId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{draft.body ? "Regenerate email" : "Generate email"}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Button size="sm" variant={active ? "secondary" : "ghost"} onClick={() => onSelect(lead.id)} className="h-7 px-2 text-xs" aria-label={`Review email for ${name(lead)}`}>
                  {active && <Check className="mr-1 h-3 w-3" />}{active ? "Reviewing" : "Review"}
                </Button>
              </div>
            </div>
            <div className="space-y-3 p-3">
              <div className="flex gap-2 text-[0.8125rem]"><span className="shrink-0 text-muted-foreground">Subject</span><span className="min-w-0 break-words text-foreground">{draft.subject || "Not written yet"}</span></div>
              {mode === "mobile" && draft.body ? (
                <div className="mx-auto max-w-[375px] whitespace-pre-wrap break-words rounded-md border border-border bg-background p-4 text-sm leading-relaxed text-foreground" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(draft.body) }} />
              ) : (
                <Textarea aria-label={`Email body for ${name(lead)}`} value={draft.body} onFocus={() => onSelect(lead.id)} onChange={(event) => onChange(lead.id, { body: event.target.value })} className="min-h-[240px] w-full text-sm leading-relaxed" placeholder="Not drafted yet" />
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}