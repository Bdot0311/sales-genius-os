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
];

interface AutoPause {
  enabled: boolean;
  max_failed_invoices: number;
  pause_on_dunning_exhausted: boolean;
}

interface Settings {
  enabled: boolean;
  recipients: string[];
  events: Record<string, boolean>;
  auto_pause: AutoPause;
}

const AUTO_PAUSE_DEFAULTS: AutoPause = {
  enabled: true,
  max_failed_invoices: 3,
  pause_on_dunning_exhausted: true,
};

const DEFAULTS: Settings = {
  enabled: true,
  recipients: [],
  events: Object.fromEntries(EVENTS.map((e) => [e.key, true])),
  auto_pause: AUTO_PAUSE_DEFAULTS,
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
      </CardContent>
    </Card>
  );
}

export default BillingNotificationSettings;
