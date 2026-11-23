import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Clock, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { readFunctionError } from "@/lib/handle-send-error";

interface DraftRecipient { id: string; subject: string | null; leads?: { contact_name: string; contact_email?: string | null } | null }
interface Props { mode: "send" | "schedule" | null; drafts: DraftRecipient[]; onClose: () => void; onComplete: () => void }

export function DraftDeliveryDialog({ mode, drafts, onClose, onComplete }: Props) {
  const queryClient = useQueryClient();
  const [accounts, setAccounts] = useState<{ id: string; email: string }[]>([]);
  const [mailbox, setMailbox] = useState("all");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ queued: number; errors: { id: string; reason: string }[] } | null>(null);
  useEffect(() => {
    if (!mode) return;
    let active = true;
    setResult(null);
    setMailbox("all");
    setAccounts([]);
    setLoading(true);
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in to send your drafts.");
      const { data, error } = await supabase.from("sending_accounts").select("id,email").eq("user_id", user.id).eq("status", "active").order("email");
      if (error) throw error;
      if (active) setAccounts(data ?? []);
    })().catch(error => { if (active) toast.error(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [mode]);

  const submit = async () => {
    if (!mode || !drafts.length || busy) return;
    const when = date ? new Date(date) : null;
    if (mode === "schedule" && (!when || !Number.isFinite(when.getTime()) || when.getTime() <= Date.now())) {
      toast.error("Choose a future date and time."); return;
    }
    setBusy(true);
    let queued = 0;
    const errors: { id: string; reason: string }[] = [];
    try {
      for (let offset = 0; offset < drafts.length; offset += 100) {
        const batch = drafts.slice(offset, offset + 100);
        const { data, error } = await supabase.functions.invoke("queue-saved-drafts", { body: {
          draft_ids: batch.map(draft => draft.id), confirmed: true,
          ...(mailbox !== "all" ? { from_emails: [mailbox] } : {}),
          ...(mode === "schedule" && when ? { send_at: when.toISOString() } : {}),
        } });
        if (error || data?.error) {
          const reason = error ? (await readFunctionError(error)).payload.error ?? "Could not confirm the queue. Refresh before retrying." : String(data.error);
          drafts.slice(offset).forEach(draft => errors.push({ id: draft.id, reason }));
          break;
        }
        queued += Number(data.queued) || 0;
        for (const row of data.results ?? []) if (!row.queued) errors.push({ id: row.draft_id, reason: row.error ?? "Not queued" });
      }
      setResult({ queued, errors });
      if (queued) toast.success(`${queued} email${queued === 1 ? "" : "s"} ${mode === "schedule" ? "scheduled" : "queued to send"}`);
    } catch {
      toast.error("The result could not be confirmed. Refresh before retrying.");
    } finally {
      setBusy(false);
      onComplete();
      queryClient.invalidateQueries({ queryKey: ["inbox-email-drafts"] });
      queryClient.invalidateQueries({ queryKey: ["inbox-sent-emails"] });
    }
  };

  return <Dialog open={mode !== null} onOpenChange={open => { if (!open && !busy) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto w-[90vw] sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{mode === "schedule" ? "Schedule" : "Send"} {drafts.length} selected draft{drafts.length === 1 ? "" : "s"}</DialogTitle>
        <DialogDescription>{result ? "Check Sent emails for delivery status." : "Each recipient receives their own saved message. Research, quality, unsubscribe and sending limits still apply."}</DialogDescription>
      </DialogHeader>
      {result ? <div className="space-y-3">
        <p className="font-medium">{result.queued} {mode === "schedule" ? "scheduled" : "queued to send"} · {result.errors.length} held back</p>
        {result.errors.length > 0 && <ul className="space-y-2 text-sm max-h-64 overflow-y-auto">{result.errors.map(row => <li key={row.id} className="border-b border-border pb-2"><span className="font-medium">{drafts.find(draft => draft.id === row.id)?.subject ?? "Draft"}</span><p className="text-destructive">{row.reason}</p></li>)}</ul>}
      </div> : <div className="space-y-4">
        <div className="space-y-2"><Label>From mailbox</Label><Select value={mailbox} onValueChange={setMailbox} disabled={busy || loading}><SelectTrigger aria-label="From mailbox"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Rotate active mailboxes</SelectItem>{accounts.map(account => <SelectItem key={account.id} value={account.email}>{account.email}</SelectItem>)}</SelectContent></Select></div>
        {loading ? <p className="text-sm text-muted-foreground">Loading mailboxes…</p> : !accounts.length && <p className="text-sm text-destructive">Connect or resume a mailbox before sending.</p>}
        {mode === "schedule" && <div className="space-y-2"><Label htmlFor="draft-send-at">Date and time ({Intl.DateTimeFormat().resolvedOptions().timeZone})</Label><Input id="draft-send-at" type="datetime-local" value={date} onChange={event => setDate(event.target.value)} disabled={busy} /></div>}
        <ul className="max-h-48 overflow-y-auto divide-y divide-border text-sm">{drafts.map(draft => <li key={draft.id} className="py-2"><p className="font-medium break-words">{draft.subject || "No subject"}</p><p className="text-muted-foreground break-all">{draft.leads?.contact_email || draft.leads?.contact_name || "No recipient"}</p></li>)}</ul>
      </div>}
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={busy}>{result ? "Done" : "Cancel"}</Button>
        {!result && <Button onClick={submit} disabled={busy || loading || !accounts.length || !drafts.length}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : mode === "schedule" ? <Clock className="mr-2 h-4 w-4" /> : <Send className="mr-2 h-4 w-4" />}{busy ? "Queuing…" : mode === "schedule" ? "Confirm schedule" : "Confirm send"}</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}