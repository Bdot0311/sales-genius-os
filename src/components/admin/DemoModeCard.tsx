import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useDemoMode } from "@/hooks/use-demo-mode";
import { MonitorPlay, Loader2, Database, Trash2, RefreshCw } from "lucide-react";

const LABELS: Record<string, string> = {
  companies: "Companies",
  leads: "Leads",
  icp_profiles: "ICP profiles",
  personas: "Personas",
  email_sequences: "Sequences",
  sequence_steps: "Sequence steps",
  sequence_enrollments: "Enrollments",
  sent_emails: "Sent emails",
  reply_threads: "Inbox replies",
  deals: "Deals",
  activities: "Activities",
  agent_configs: "AI agents",
  agent_actions: "Agent actions",
  sending_domains: "Sending domains",
  sending_accounts: "Mailboxes",
  reputation_snapshots: "Reputation snapshots",
};

export const DemoModeCard = () => {
  const { toast } = useToast();
  const { isDemoMode, state, refresh } = useDemoMode();
  const [busy, setBusy] = useState<null | "seed" | "clear" | "toggle" | "status">(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [total, setTotal] = useState(0);

  const call = useCallback(async (action: "seed" | "clear" | "status") => {
    const { data, error } = await supabase.functions.invoke("admin-demo-data", { body: { action } });
    if (error) throw new Error(error.message);
    if (data?.error) throw new Error(data.error);
    setCounts(data?.counts ?? {});
    setTotal(data?.total ?? 0);
    return data;
  }, []);

  useEffect(() => {
    call("status").catch(() => {});
  }, [call]);

  const run = async (action: "seed" | "clear") => {
    setBusy(action);
    try {
      await call(action);
      await refresh();
      toast({
        title: action === "seed" ? "Demo data seeded" : "Demo data cleared",
        description:
          action === "seed"
            ? "Demo mode is on. Real sends, searches and credit spend are simulated."
            : "Demo mode is off and every demo record was removed.",
      });
    } catch (e) {
      toast({
        title: `Could not ${action} demo data`,
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  const toggle = async (next: boolean) => {
    setBusy("toggle");
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const uid = sessionData.session?.user?.id;
      const { error } = await supabase.from("admin_settings").upsert(
        {
          setting_key: "demo_mode",
          category: "general",
          setting_value: { enabled: next, admin_user_id: uid, seeded_at: state.seededAt },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "setting_key" },
      );
      if (error) throw error;
      await refresh();
      toast({
        title: next ? "Demo mode on" : "Demo mode off",
        description: next
          ? "Plan gates are lifted and outbound is simulated for your account."
          : "Back to normal behaviour. Seeded demo data is untouched.",
      });
    } catch (e) {
      toast({
        title: "Could not update demo mode",
        description: e instanceof Error ? e.message : "Unexpected error",
        variant: "destructive",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MonitorPlay className="h-5 w-5 text-primary" />
            <CardTitle>Demo Mode</CardTitle>
            {isDemoMode && <Badge className="bg-primary">Active</Badge>}
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="demo-mode-toggle" className="text-sm text-muted-foreground">
              {isDemoMode ? "On" : "Off"}
            </Label>
            <Switch
              id="demo-mode-toggle"
              checked={isDemoMode}
              disabled={busy !== null}
              onCheckedChange={toggle}
            />
          </div>
        </div>
        <CardDescription>
          Fills your own account with a realistic outbound operation for prospect calls. While it's on, plan gates are
          lifted, real emails, lead searches, enrichment and agent runs are simulated instead of spending credits, and
          real customer names are masked on screen. Nothing here affects other users.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => run("seed")} disabled={busy !== null}>
            {busy === "seed" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
            {total > 0 ? "Reseed demo data" : "Seed demo data"}
          </Button>
          <Button variant="outline" onClick={() => call("status").catch(() => {})} disabled={busy !== null}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh status
          </Button>
          <Button variant="destructive" onClick={() => run("clear")} disabled={busy !== null || total === 0}>
            {busy === "clear" ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
            Clear demo data
          </Button>
        </div>

        <div className="text-sm text-muted-foreground">
          {total > 0 ? (
            <>
              {total.toLocaleString()} demo records seeded
              {state.seededAt ? ` · last seeded ${new Date(state.seededAt).toLocaleString()}` : ""}
            </>
          ) : (
            "No demo data seeded yet."
          )}
        </div>

        {total > 0 && (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(counts)
              .filter(([, n]) => n > 0)
              .map(([table, n]) => (
                <div key={table} className="rounded-md border bg-muted/30 px-3 py-2 text-sm flex items-center justify-between">
                  <span className="truncate text-muted-foreground">{LABELS[table] ?? table}</span>
                  <span className="font-semibold">{n}</span>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
