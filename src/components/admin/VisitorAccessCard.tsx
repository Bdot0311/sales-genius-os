import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";

interface GrantRow {
  user_id: string;
  enabled: boolean;
  note: string | null;
  email?: string | null;
}

/**
 * Per-workspace grant. The visitorIntelligence flag above is the kill switch;
 * a workspace still sees nothing until a row here is enabled.
 */
export function VisitorAccessCard() {
  const [email, setEmail] = useState("");
  const [rows, setRows] = useState<GrantRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("visitor_workspace_grants")
      .select("user_id, enabled, note")
      .order("updated_at", { ascending: false });
    if (error) {
      setMessage(error.message);
      return;
    }
    const ids = (data ?? []).map((row) => row.user_id);
    const { data: profiles } = ids.length
      ? await supabase.from("profiles").select("id, email").in("id", ids)
      : { data: [] };
    const byId = new Map((profiles ?? []).map((profile) => [profile.id, profile.email]));
    setRows((data ?? []).map((row) => ({ ...row, email: byId.get(row.user_id) ?? row.note })));
  };

  useEffect(() => {
    void load();
  }, []);

  const grant = async () => {
    setSaving(true);
    setMessage(null);
    const { data: profile, error } = await supabase.from("profiles").select("id, email").eq("email", email.trim().toLowerCase()).maybeSingle();
    if (error || !profile) {
      setMessage(error?.message ?? "No workspace with that email.");
      setSaving(false);
      return;
    }
    const { data: session } = await supabase.auth.getUser();
    const { error: writeError } = await supabase.from("visitor_workspace_grants").upsert({
      user_id: profile.id,
      enabled: true,
      enabled_by: session.user?.id ?? null,
      note: profile.email,
    });
    setMessage(writeError ? writeError.message : `Granted ${profile.email}. The visitorIntelligence flag must also be on.`);
    setEmail("");
    setSaving(false);
    await load();
  };

  const toggle = async (row: GrantRow, enabled: boolean) => {
    const { error } = await supabase.from("visitor_workspace_grants").update({ enabled }).eq("user_id", row.user_id);
    if (error) setMessage(error.message);
    await load();
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle>Visitor Intelligence access</PanelTitle>
        <PanelDescription>
          Off for every workspace until you grant one. Turn the visitorIntelligence flag on as well, or the grant does nothing.
        </PanelDescription>
      </PanelHeader>
      <PanelBody className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="workspace email"
            aria-label="Workspace email"
          />
          <Button onClick={() => void grant()} disabled={saving || !email.trim()}>Grant access</Button>
        </div>
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No workspace has been granted.</p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((row) => (
              <li key={row.user_id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm">{row.email || row.user_id}</span>
                <Switch checked={row.enabled} onCheckedChange={(checked) => void toggle(row, checked)} aria-label={`Toggle ${row.email || row.user_id}`} />
              </li>
            ))}
          </ul>
        )}
      </PanelBody>
    </Panel>
  );
}
