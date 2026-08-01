import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CreditCard,
  RefreshCw,
  AlertTriangle,
  Lock,
  Unlock,
  Trash2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { BillingNotificationSettings } from "@/components/admin/BillingNotificationSettings";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

interface BillingIssue {
  alert_id: string;
  category: string;
  severity: string;
  message: string;
  details: Record<string, any> | null;
  created_at: string;
  resolved: boolean;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  plan: string | null;
  account_status: string | null;
  subscription_status: string | null;
  cancel_at_period_end: boolean | null;
  current_period_end: string | null;
  payment_failed_at: string | null;
  is_locked: boolean | null;
}

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  warning: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  error: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  critical: "bg-red-500/10 text-red-400 border-red-500/20",
};

const CATEGORY_LABEL: Record<string, string> = {
  billing_cancellation: "Cancelled",
  billing_cancellation_scheduled: "Cancellation scheduled",
  billing_payment_failed: "Payment failed",
  billing_payment_action_required: "Card authentication needed",
  billing_dispute: "Chargeback",
  billing_subscription_paused: "Subscription paused",
};

export default function AdminBilling() {
  const [issues, setIssues] = useState<BillingIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BillingIssue | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("admin_get_billing_issues" as any, {
      _include_resolved: includeResolved,
    });
    if (error) {
      toast.error("Failed to load billing issues");
      console.error(error);
    } else {
      setIssues((data as unknown as BillingIssue[]) ?? []);
    }
    setLoading(false);
  }, [includeResolved]);

  useEffect(() => {
    load();
  }, [load]);

  useAutoRefresh(load, 60_000);

  const stats = useMemo(() => {
    const open = issues.filter((i) => !i.resolved);
    const byCat = (cat: string) => open.filter((i) => i.category === cat).length;
    return {
      failed: byCat("billing_payment_failed") + byCat("billing_payment_action_required"),
      cancelled: byCat("billing_cancellation"),
      scheduled: byCat("billing_cancellation_scheduled"),
      disputes: byCat("billing_dispute"),
    };
  }, [issues]);

  const resolve = async (id: string) => {
    setBusy(id);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("system_alerts" as any)
      .update({ resolved: true, resolved_at: new Date().toISOString(), resolved_by: user?.id })
      .eq("id", id);
    setBusy(null);
    if (error) return toast.error("Failed to resolve");
    toast.success("Marked as handled");
    load();
  };

  const lockUser = async (issue: BillingIssue) => {
    if (!issue.user_id) return;
    setBusy(issue.alert_id);
    const { error } = await supabase.rpc("admin_lock_user" as any, {
      _user_id: issue.user_id,
      _reason: `Billing: ${CATEGORY_LABEL[issue.category] ?? issue.category}`,
    });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Account paused");
    load();
  };

  const unlockUser = async (issue: BillingIssue) => {
    if (!issue.user_id) return;
    setBusy(issue.alert_id);
    const { error } = await supabase.rpc("admin_unlock_user" as any, { _user_id: issue.user_id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Account restored");
    load();
  };

  const removeUser = async () => {
    const issue = deleteTarget;
    setDeleteTarget(null);
    if (!issue?.user_id) return;
    setBusy(issue.alert_id);
    const { error } = await supabase.rpc("admin_delete_user" as any, { _user_id: issue.user_id });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Account removed");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" />
            Billing &amp; Churn
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cancellations, failed payments, card authentication requests and chargebacks — with
            controls to pause or remove the account.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="resolved" checked={includeResolved} onCheckedChange={setIncludeResolved} />
            <Label htmlFor="resolved" className="text-sm text-muted-foreground">
              Show handled
            </Label>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Payment issues", value: stats.failed },
          { label: "Cancelled", value: stats.cancelled },
          { label: "Cancelling soon", value: stats.scheduled },
          { label: "Chargebacks", value: stats.disputes },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <BillingNotificationSettings />



      {!loading && issues.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-3 text-primary" />
            No billing issues. Every subscription is paying and active.
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {issues.map((issue) => (
          <Card key={issue.alert_id} className={issue.resolved ? "opacity-60" : undefined}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className={SEVERITY_BADGE[issue.severity] ?? ""}>
                      {CATEGORY_LABEL[issue.category] ?? issue.category}
                    </Badge>
                    {issue.plan && <Badge variant="secondary">{issue.plan}</Badge>}
                    {issue.is_locked && (
                      <Badge variant="outline" className="bg-red-500/10 text-red-400 border-red-500/20">
                        Paused
                      </Badge>
                    )}
                    {issue.resolved && <Badge variant="outline">Handled</Badge>}
                  </div>
                  <p className="text-sm font-medium break-words">{issue.message}</p>
                  <p className="text-xs text-muted-foreground">
                    {issue.email ?? "unknown customer"}
                    {issue.full_name ? ` · ${issue.full_name}` : ""} ·{" "}
                    {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
                    {issue.subscription_status ? ` · status: ${issue.subscription_status}` : ""}
                    {issue.cancel_at_period_end && issue.current_period_end
                      ? ` · access until ${new Date(issue.current_period_end).toLocaleDateString()}`
                      : ""}
                  </p>
                  {issue.details?.reason && (
                    <p className="text-xs text-orange-400 flex items-start gap-1">
                      <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                      {String(issue.details.reason)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {issue.details?.invoice_url && (
                    <Button variant="outline" size="sm" asChild>
                      <a href={String(issue.details.invoice_url)} target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
                        Invoice
                      </a>
                    </Button>
                  )}
                  {issue.user_id &&
                    (issue.is_locked ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === issue.alert_id}
                        onClick={() => unlockUser(issue)}
                      >
                        <Unlock className="h-3.5 w-3.5 mr-1.5" />
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === issue.alert_id}
                        onClick={() => lockUser(issue)}
                      >
                        <Lock className="h-3.5 w-3.5 mr-1.5" />
                        Pause access
                      </Button>
                    ))}
                  {issue.user_id && (
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={busy === issue.alert_id}
                      onClick={() => setDeleteTarget(issue)}
                    >
                      <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                      Remove
                    </Button>
                  )}
                  {!issue.resolved && (
                    <Button
                      size="sm"
                      disabled={busy === issue.alert_id}
                      onClick={() => resolve(issue.alert_id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Handled
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this account?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {deleteTarget?.email ?? "the user"} and all of their data. It
              cannot be undone. Pausing access is reversible — removal is not.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={removeUser}>Remove account</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
