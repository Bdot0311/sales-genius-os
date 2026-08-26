import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The account-wide daily send cap.
 *
 * subscriptions.daily_email_limit is enforced by send-email on EVERY send —
 * Outreach Studio singles, the agent, scheduled sends, sequences — and by
 * process-scheduled-emails. The only place to change it was inside the Bulk
 * Send dialog, which put an account-wide control behind a bulk-only door: the
 * location implied a scope it does not have, and it could not be found by
 * anyone looking through pages.
 *
 * Sending caps belong here, alongside the per-mailbox limits in
 * SendingControlsDialog. This one sits above those: the account cannot exceed
 * it however many mailboxes are connected.
 */
export function AccountSendLimit() {
  const [planCap, setPlanCap] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const [sentToday, setSentToday] = useState(0);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase
        .from("subscriptions")
        .select("plan, daily_email_limit, daily_emails_sent")
        .eq("user_id", auth.user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      // The plan's own allowance, so lowering it is visibly a choice rather
      // than the only number on offer.
      // `elite` is a legacy PLAN value, not the Agency plan. Everywhere else
      // normalises it to pro (use-subscription, use-leads-usage, admin/Users),
      // and MONTHLY_EMAIL_LIMITS gives it pro's monthly figure — so it takes
      // pro's daily figure too. Agency's 1500 belongs to plan 'agency'. Elite
      // is the name of the AGENT tier that the Agency plan carries, which is a
      // different thing wearing the same word.
      const caps: Record<string, number> = {
        free: 100, starter: 100, growth: 250, pro: 500, elite: 500, agency: 1500,
      };
      setPlanCap(caps[String(data.plan ?? "free").toLowerCase()] ?? 100);
      setLimit(data.daily_email_limit ?? 10);
      setDraft(String(data.daily_email_limit ?? 10));
      setSentToday(data.daily_emails_sent ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const save = async () => {
    const next = Number(draft);
    if (!Number.isFinite(next) || next < 1) {
      toast.error("Enter a number of 1 or more.");
      return;
    }
    if (planCap !== null && next > planCap) {
      toast.error(`Your plan allows up to ${planCap} a day. Upgrade to send more.`);
      return;
    }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase
      .from("subscriptions")
      .update({ daily_email_limit: next })
      .eq("user_id", auth.user.id);
    setSaving(false);
    if (error) {
      toast.error(`Could not save: ${error.message}`);
      return;
    }
    setLimit(next);
    toast.success(`Daily send limit set to ${next}.`);
  };

  if (limit === null) return null;

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 max-w-[10rem]">
            <Label htmlFor="account-daily-limit">Emails per day</Label>
            <Input
              id="account-daily-limit"
              type="number"
              min={1}
              max={planCap ?? undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
          <Button onClick={save} disabled={saving || draft === String(limit)}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <p className="text-sm text-muted-foreground pb-2">
            {sentToday} of {limit} sent today
            {planCap !== null && limit < planCap ? ` · your plan allows ${planCap}` : ""}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          Applies to everything that sends: Outreach Studio, the AI SDR, sequences and
          scheduled sends. Per-mailbox limits sit under each account above, and the lower
          of the two always wins.
        </p>
      </CardContent>
    </Card>
  );
}
