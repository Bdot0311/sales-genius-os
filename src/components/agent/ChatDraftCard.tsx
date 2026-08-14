import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronRight, Mail } from "lucide-react";
import { LeadResearchPanel, type LeadResearch } from "@/components/outreach/LeadResearchPanel";

export interface ChatDraft {
  draft_id: string;
  lead_id: string;
  company: string | null;
  contact: string | null;
  contact_email: string | null;
  subject: string;
  body: string;
  research?: LeadResearch | null;
}

export const ChatDraftCard = ({ draft }: { draft: ChatDraft }) => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [resolved, setResolved] = useState(false);

  const who = draft.contact || draft.contact_email || "this lead";

  // Re-hydrate the live draft: if the row is gone it was already sent,
  // scheduled or deleted (usually by asking the agent to do it).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("email_drafts")
        .select("id, subject, body")
        .eq("id", draft.draft_id)
        .maybeSingle();
      if (cancelled) return;
      if (!error && !data) {
        setResolved(true);
      } else if (data) {
        setSubject(data.subject ?? draft.subject);
        setBody(data.body ?? draft.body);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.draft_id, draft.subject, draft.body]);

  const persistEdits = async () => {
    if (resolved) return;
    await supabase
      .from("email_drafts")
      .update({ subject, body, updated_at: new Date().toISOString() })
      .eq("id", draft.draft_id);
  };

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-3 space-y-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}
        <Mail className="w-3.5 h-3.5 text-primary flex-shrink-0" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{subject}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {who}
            {draft.company ? ` · ${draft.company}` : ""}
          </span>
        </span>
        {resolved && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] bg-muted/40 text-muted-foreground border-border">
            Already handled
          </Badge>
        )}
      </button>

      {open && (
        <div className="space-y-2 pt-1">
          {draft.research && <LeadResearchPanel research={draft.research} compact />}
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            onBlur={persistEdits}
            disabled={resolved}
            aria-label="Subject"
            className="text-sm"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={persistEdits}
            disabled={resolved}
            aria-label="Email body"
            rows={10}
            className="text-sm"
          />
        </div>
      )}

      {!resolved && (
        <p className="text-xs text-muted-foreground">
          Ask the agent to send, schedule, delete, or pick the mailbox for this draft.
        </p>
      )}
    </div>
  );
};
