import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "sonner";
import {
  CalendarClock,
  ChevronDown,
  ChevronRight,
  Loader2,
  Mail,
  SendHorizonal,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChatDraft {
  draft_id: string;
  lead_id: string;
  company: string | null;
  contact: string | null;
  contact_email: string | null;
  subject: string;
  body: string;
}

type DraftState = "pending" | "sent" | "scheduled" | "discarded" | "resolved";

const textLinesToHtml = (text: string) =>
  text
    .split("\n")
    .map((line) => (line.trim() ? `<p>${line.trim()}</p>` : ""))
    .join("\n");

export const ChatDraftCard = ({ draft }: { draft: ChatDraft }) => {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState(draft.subject);
  const [body, setBody] = useState(draft.body);
  const [state, setState] = useState<DraftState>("pending");
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState<null | "send" | "schedule" | "discard">(null);
  const [scheduleDate, setScheduleDate] = useState<Date | undefined>();
  const [scheduleTime, setScheduleTime] = useState("09:00");
  const [schedulePopoverOpen, setSchedulePopoverOpen] = useState(false);
  const [scheduledFor, setScheduledFor] = useState<Date | null>(null);

  const who = draft.contact || draft.contact_email || "this lead";
  const disabled = state !== "pending" || busy !== null;

  // Re-hydrate real status: if the draft row no longer exists it was already
  // sent / scheduled / discarded in a previous session — don't offer it again.
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
        setState("resolved");
      } else if (data) {
        setSubject(data.subject ?? draft.subject);
        setBody(data.body ?? draft.body);
      }
      setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [draft.draft_id, draft.subject, draft.body]);

  const persistEdits = async () => {
    await supabase
      .from("email_drafts")
      .update({ subject, body, updated_at: new Date().toISOString() })
      .eq("id", draft.draft_id);
  };

  // Atomically claim the draft so a double click / second tab can't send twice.
  const claimDraft = async () => {
    const { data, error } = await supabase
      .from("email_drafts")
      .delete()
      .eq("id", draft.draft_id)
      .select("id, user_id, lead_id, tone, trigger_context, opener_word");
    if (error) throw error;
    if (!data?.length) {
      setState("resolved");
      throw new Error("This draft was already sent or removed");
    }
    return data[0];
  };

  const restoreDraft = async (row: Record<string, unknown>) => {
    await supabase.from("email_drafts").insert({ ...row, subject, body } as never);
  };


  const handleSend = async () => {
    if (!draft.contact_email) {
      toast.error("This lead has no email address — ask the agent to enrich it first");
      return;
    }
    setBusy("send");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      const { data: accounts } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", user.id)
        .eq("integration_id", "google")
        .eq("is_active", true)
        .limit(1);

      if (!accounts?.length) {
        throw new Error("Connect a Google mailbox in Integrations first");
      }

      await persistEdits();
      const claimed = await claimDraft();

      const { error } = await supabase.functions.invoke("send-email", {
        body: {
          to: draft.contact_email,
          subject,
          body,
          integrationId: "google",
          integrationRowId: accounts[0].id,
          leadId: draft.lead_id,
        },
      });
      if (error) {
        await restoreDraft(claimed);
        throw error;
      }

      setState("sent");
      toast.success(`Email sent to ${who}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send this draft");
    } finally {
      setBusy(null);
    }
  };

  const handleSchedule = async () => {
    if (!draft.contact_email) {
      toast.error("This lead has no email address — ask the agent to enrich it first");
      return;
    }
    if (!scheduleDate) return;
    const [hours, minutes] = scheduleTime.split(":").map(Number);
    const scheduledAt = new Date(scheduleDate);
    scheduledAt.setHours(hours || 0, minutes || 0, 0, 0);
    if (scheduledAt <= new Date()) {
      toast.error("Pick a future date and time");
      return;
    }

    setBusy("schedule");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      await persistEdits();
      const claimed = await claimDraft();

      const { error } = await supabase.from("sent_emails").insert({
        user_id: user.id,
        lead_id: draft.lead_id,
        to_email: draft.contact_email,
        subject,
        body_html: `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}p{margin:0 0 16px}</style></head><body>${textLinesToHtml(body)}</body></html>`,
        body_text: body,
        status: "scheduled",
        scheduled_at: scheduledAt.toISOString(),
      });
      if (error) {
        await restoreDraft(claimed);
        throw error;
      }

      setScheduledFor(scheduledAt);
      setState("scheduled");
      setSchedulePopoverOpen(false);
      toast.success(`Scheduled for ${format(scheduledAt, "PPP 'at' p")}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule this draft");
    } finally {
      setBusy(null);
    }
  };

  const handleDiscard = async () => {
    setBusy("discard");
    try {
      await supabase.from("email_drafts").delete().eq("id", draft.draft_id);
      setState("discarded");
      toast.success("Draft discarded");
    } finally {
      setBusy(null);
    }

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
        {state !== "pending" && (
          <Badge
            variant="outline"
            className={cn(
              "px-1.5 py-0 text-[10px]",
              state === "sent"
                ? "bg-green-500/15 text-green-400 border-green-500/30"
                : state === "scheduled"
                  ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                  : "bg-muted/40 text-muted-foreground border-border",
            )}
          >
            {state === "sent"
              ? "Sent"
              : state === "scheduled"
                ? scheduledFor
                  ? `Scheduled ${format(scheduledFor, "MMM d, p")}`
                  : "Scheduled"
                : "Discarded"}
          </Badge>
        )}
      </button>

      {open && (
        <div className="space-y-2 pt-1">
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={disabled}
            aria-label="Subject"
            className="text-sm"
          />
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={disabled}
            aria-label="Email body"
            rows={10}
            className="text-sm"
          />
        </div>
      )}

      {state === "pending" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" className="gap-1.5" disabled={busy !== null} onClick={handleSend}>
            {busy === "send" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <SendHorizonal className="w-3.5 h-3.5" />
            )}
            Send now
          </Button>

          <Popover open={schedulePopoverOpen} onOpenChange={setSchedulePopoverOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5" disabled={busy !== null}>
                <CalendarClock className="w-3.5 h-3.5" />
                Schedule
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-3 space-y-3" align="start">
              <Calendar
                mode="single"
                selected={scheduleDate}
                onSelect={setScheduleDate}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                className="pointer-events-auto"
              />
              <Input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                aria-label="Send time"
              />
              <Button
                size="sm"
                className="w-full gap-1.5"
                disabled={!scheduleDate || busy !== null}
                onClick={handleSchedule}
              >
                {busy === "schedule" ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CalendarClock className="w-3.5 h-3.5" />
                )}
                Schedule send
              </Button>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            variant="ghost"
            className="gap-1.5 text-muted-foreground"
            disabled={busy !== null}
            onClick={handleDiscard}
          >
            {busy === "discard" ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
            Discard
          </Button>
        </div>
      )}
    </div>
  );
};
