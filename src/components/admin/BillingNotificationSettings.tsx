import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, X, Loader2 } from "lucide-react";
import { toast } from "sonner";

const SETTING_KEY = "billing_notifications";

const EVENTS: { key: string; label: string; hint: string }[] = [
  { key: "billing_cancellation", label: "Subscription cancelled", hint: "Access ended and the account went inactive" },
  { key: "billing_cancellation_scheduled", label: "Cancellation scheduled", hint: "Customer turned off renewal" },
  { key: "billing_payment_failed", label: "Invoice payment failed", hint: "Card declined or invoice unpaid" },
  { key: "billing_payment_action_required", label: "Card authentication needed", hint: "3DS confirmation pending" },
  { key: "billing_dispute", label: "Chargeback opened", hint: "Dispute filed against a charge" },
  { key: "billing_subscription_paused", label: "Subscription paused", hint: "Paused in Stripe" },
  { key: "billing_auto_paused", label: "Account auto-paused", hint: "Paused automatically after repeated failed invoices" },
  { key: "billing_auto_resumed", label: "Access auto-restored", hint: "Restored automatically after a successful payment or retry" },
];

interface AutoPause {
  enabled: boolean;
  max_failed_invoices: number;
  pause_on_dunning_exhausted: boolean;
}

interface Grace {
  enabled: boolean;
  days: number;
}

interface AutoResume {
  enabled: boolean;
  on_invoice_paid: boolean;
  on_subscription_active: boolean;
}

interface Settings {
  enabled: boolean;
  recipients: string[];
  events: Record<string, boolean>;
  auto_pause: AutoPause;
  grace: Grace;
  auto_resume: AutoResume;
}

const AUTO_PAUSE_DEFAULTS: AutoPause = {
  enabled: true,
  max_failed_invoices: 3,
  pause_on_dunning_exhausted: true,
};

const GRACE_DEFAULTS: Grace = { enabled: true, days: 7 };

const AUTO_RESUME_DEFAULTS: AutoResume = {
  enabled: true,
  on_invoice_paid: true,
  on_subscription_active: true,
};

const DEFAULTS: Settings = {
  enabled: true,
  recipients: [],
  events: Object.fromEntries(EVENTS.map((e) => [e.key, true])),
  auto_pause: AUTO_PAUSE_DEFAULTS,
  grace: GRACE_DEFAULTS,
  auto_resume: AUTO_RESUME_DEFAULTS,
};


export function BillingNotificationSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newEmail, setNewEmail] = useState("");

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("admin_settings" as any)
      .select("setting_value")
      .eq("setting_key", SETTING_KEY)
      .maybeSingle();
    if (!error && data) {
      const v = ((data as any).setting_value ?? {}) as Partial<Settings>;
      setSettings({
        enabled: v.enabled !== false,
        recipients: Array.isArray(v.recipients) ? v.recipients : [],
        events: { ...DEFAULTS.events, ...(v.events ?? {}) },
        auto_pause: { ...AUTO_PAUSE_DEFAULTS, ...(v.auto_pause ?? {}) },
        grace: { ...GRACE_DEFAULTS, ...(v.grace ?? {}) },
        auto_resume: { ...AUTO_RESUME_DEFAULTS, ...(v.auto_resume ?? {}) },
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = async (next: Settings) => {
    setSettings(next);
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("admin_settings" as any)
      .update({ setting_value: next as any, updated_by: user?.id, updated_at: new Date().toISOString() })
      .eq("setting_key", SETTING_KEY);
    setSaving(false);
    if (error) {
      toast.error("Could not save notification settings");
      load();
      return;
    }
    toast.success("Notification settings saved");
  };

  const addRecipient = () => {
    const email = newEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("Enter a valid email address");
    if (settings.recipients.includes(email)) return toast.error("Already on the list");
    setNewEmail("");
    persist({ ...settings, recipients: [...settings.recipients, email] });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="h-4 w-4 text-primary" />
          Billing alert emails
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </CardTitle>
        <CardDescription>
          Who gets emailed the moment a subscription cancels or an invoice fails. Every alert includes the
          customer's email and a direct link to the Stripe invoice when one exists.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
          <div>
            <Label className="text-sm">Send billing alert emails</Label>
            <p className="text-xs text-muted-foreground">
              Alerts are always recorded here even when emails are off.
            </p>
          </div>
          <Switch
            checked={settings.enabled}
            disabled={loading}
            onCheckedChange={(v) => persist({ ...settings, enabled: v })}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Recipients</Label>
          <div className="flex flex-wrap gap-2">
            {settings.recipients.length === 0 && (
              <Badge variant="outline" className="text-muted-foreground">
                No recipients — falling back to the default support inbox
              </Badge>
            )}
            {settings.recipients.map((r) => (
              <Badge key={r} variant="secondary" className="gap-1 pr-1">
                {r}
                <button
                  type="button"
                  aria-label={`Remove ${r}`}
                  className="rounded p-0.5 hover:bg-background/60"
                  onClick={() =>
                    persist({ ...settings, recipients: settings.recipients.filter((x) => x !== r) })
                  }
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="you@company.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addRecipient();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addRecipient} disabled={loading}>
              <Plus className="mr-1 h-4 w-4" />
              Add
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Events that trigger an email</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {EVENTS.map((e) => (
              <div
                key={e.key}
                className="flex items-start justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">{e.label}</p>
                  <p className="text-xs text-muted-foreground">{e.hint}</p>
                </div>
                <Switch
                  checked={settings.events[e.key] !== false}
                  disabled={loading || !settings.enabled}
                  onCheckedChange={(v) =>
                    persist({ ...settings, events: { ...settings.events, [e.key]: v } })
                  }
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label className="text-sm">Automatically pause unpaid accounts</Label>
              <p className="text-xs text-muted-foreground">
                Pauses access after repeated failed invoices and records the reason in the billing log.
              </p>
            </div>
            <Switch
              checked={settings.auto_pause.enabled}
              disabled={loading}
              onCheckedChange={(v) =>
                persist({ ...settings, auto_pause: { ...settings.auto_pause, enabled: v } })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm" htmlFor="max-failed-invoices">
              Failed invoices before pausing
            </Label>
            <Input
              id="max-failed-invoices"
              type="number"
              min={1}
              max={10}
              className="w-20"
              value={settings.auto_pause.max_failed_invoices}
              disabled={loading || !settings.auto_pause.enabled}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  auto_pause: {
                    ...settings.auto_pause,
                    max_failed_invoices: Number(e.target.value),
                  },
                })
              }
              onBlur={() => {
                const n = Math.min(10, Math.max(1, Math.floor(settings.auto_pause.max_failed_invoices) || 3));
                persist({ ...settings, auto_pause: { ...settings.auto_pause, max_failed_invoices: n } });
              }}
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Pause when Stripe stops retrying</Label>
              <p className="text-xs text-muted-foreground">
                Also pause as soon as the subscription becomes unpaid after dunning is exhausted.
              </p>
            </div>
            <Switch
              checked={settings.auto_pause.pause_on_dunning_exhausted}
              disabled={loading || !settings.auto_pause.enabled}
              onCheckedChange={(v) =>
                persist({
                  ...settings,
                  auto_pause: { ...settings.auto_pause, pause_on_dunning_exhausted: v },
                })
              }
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Grace period before pausing</Label>
              <p className="text-xs text-muted-foreground">
                After a failed payment the customer keeps access for this many days. Pausing only
                happens once the window ends with the invoice still unpaid.
              </p>
            </div>
            <Switch
              checked={settings.grace.enabled}
              disabled={loading}
              onCheckedChange={(v) => persist({ ...settings, grace: { ...settings.grace, enabled: v } })}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <Label className="text-sm" htmlFor="grace-days">
              Grace period length (days)
            </Label>
            <Input
              id="grace-days"
              type="number"
              min={0}
              max={30}
              className="w-20"
              value={settings.grace.days}
              disabled={loading || !settings.grace.enabled}
              onChange={(e) =>
                setSettings({ ...settings, grace: { ...settings.grace, days: Number(e.target.value) } })
              }
              onBlur={() => {
                const n = Math.min(30, Math.max(0, Math.floor(settings.grace.days) || 0));
                persist({ ...settings, grace: { ...settings.grace, days: n } });
              }}
            />
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Automatically restore access when payment succeeds</Label>
              <p className="text-xs text-muted-foreground">
                Clears the grace period, failure count and auto-pause. Accounts you paused or removed
                manually are never restored automatically.
              </p>
            </div>
            <Switch
              checked={settings.auto_resume.enabled}
              disabled={loading}
              onCheckedChange={(v) =>
                persist({ ...settings, auto_resume: { ...settings.auto_resume, enabled: v } })
              }
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Resume on paid invoice</Label>
              <p className="text-xs text-muted-foreground">Triggered by Stripe's invoice.paid event.</p>
            </div>
            <Switch
              checked={settings.auto_resume.on_invoice_paid}
              disabled={loading || !settings.auto_resume.enabled}
              onCheckedChange={(v) =>
                persist({ ...settings, auto_resume: { ...settings.auto_resume, on_invoice_paid: v } })
              }
            />
          </div>

          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Label className="text-sm">Resume on successful retry</Label>
              <p className="text-xs text-muted-foreground">
                Triggered when Stripe moves a past-due or unpaid subscription back to active.
              </p>
            </div>
            <Switch
              checked={settings.auto_resume.on_subscription_active}
              disabled={loading || !settings.auto_resume.enabled}
              onCheckedChange={(v) =>
                persist({
                  ...settings,
                  auto_resume: { ...settings.auto_resume, on_subscription_active: v },
                })
              }
            />
          </div>
        </div>

      </CardContent>
    </Card>
  );
}

export default BillingNotificationSettings;
