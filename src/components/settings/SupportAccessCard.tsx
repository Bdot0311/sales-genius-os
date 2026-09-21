import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Panel, PanelBody, PanelDescription, PanelHeader, PanelTitle } from "@/components/dashboard/Panel";
import { Separator } from "@/components/ui/separator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { CalendarClock, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { SCOPE_LABELS, SUPPORT_SCOPES, SCOPE_SEQUENCES } from "@/lib/support-access";

interface Grant {
  id: string;
  scopes: string[];
  granted_at: string;
  expires_at: string;
  revoked_at: string | null;
  completed_at: string | null;
}

interface AccessEvent {
  id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
}

// Consent is per area now: granting a sequence build no longer hands over the
// ICP and the agent settings along with it.

export const SupportAccessCard = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [grant, setGrant] = useState<Grant | null>(null);
  const [events, setEvents] = useState<AccessEvent[]>([]);
  /** Starts at the one area setup actually needs; the rest are opt-in. */
  const [chosen, setChosen] = useState<string[]>([SCOPE_SEQUENCES]);

  const load = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const [{ data: grants }, { data: evts }] = await Promise.all([
      supabase
        .from("support_access_grants")
        .select("id, scopes, granted_at, expires_at, revoked_at, completed_at")
        .eq("user_id", user.id)
        .order("granted_at", { ascending: false })
        .limit(1),
      supabase
        .from("support_access_events")
        .select("id, action, entity_type, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10),
    ]);

    setGrant((grants?.[0] as Grant) ?? null);
    setEvents((evts as AccessEvent[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const isActive =
    !!grant && !grant.revoked_at && !grant.completed_at && new Date(grant.expires_at) > new Date();

  const handleGrant = async () => {
    setBusy(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not signed in");

      if (chosen.length === 0) {
        toast.error("Pick at least one thing we're allowed to work on");
        return;
      }

      const { error } = await supabase.from("support_access_grants").insert({
        user_id: user.id,
        scopes: chosen,
      });
      if (error) throw error;
      toast.success("Access granted for 14 days — you can revoke it anytime");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not grant access");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!grant) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("support_access_grants")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", grant.id);
      if (error) throw error;
      toast.success("Access revoked — the OutReign team can no longer reach your account");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not revoke access");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel>
      <PanelHeader>
        <PanelTitle className="flex items-center gap-2">
          <KeyRound className="h-5 w-5" />
          Campaign setup access
        </PanelTitle>
        <PanelDescription>
          Let the OutReign team build your campaigns inside your account — without ever sharing your
          password. Access is limited, time-boxed and fully logged.
        </PanelDescription>
      </PanelHeader>
      <PanelBody className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : isActive && grant ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="bg-green-500/15 text-green-400 border-green-500/30" variant="outline">
                <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                Active
              </Badge>
              <span className="text-sm text-muted-foreground flex items-center gap-1.5">
                <CalendarClock className="h-3.5 w-3.5" />
                Expires automatically on {format(new Date(grant.expires_at), "PPP 'at' p")}
              </span>
            </div>

            <ul className="text-sm text-muted-foreground space-y-1">
              {grant.scopes.map((s) => (
                <li key={s}>• {SCOPE_LABELS[s] ?? s}</li>
              ))}
              <li>• No access to your password, billing details or mailbox credentials</li>
            </ul>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={busy} className="gap-1.5">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                  Revoke access now
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Revoke campaign setup access?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The OutReign team will immediately lose access to your campaigns and leads. Any
                    setup already in progress may be left unfinished.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep access</AlertDialogCancel>
                  <AlertDialogAction onClick={handleRevoke}>Revoke</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border">
                <ShieldOff className="h-3.5 w-3.5 mr-1" />
                No access granted
              </Badge>
              {grant && (
                <span className="text-xs text-muted-foreground">
                  Last grant ended {format(new Date(grant.revoked_at ?? grant.completed_at ?? grant.expires_at), "PPP")}
                </span>
              )}
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">Choose what we're allowed to work on</p>
              {SUPPORT_SCOPES.map((scope) => (
                <label key={scope} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Checkbox
                    checked={chosen.includes(scope)}
                    onCheckedChange={(v) =>
                      setChosen((prev) =>
                        v === true ? [...new Set([...prev, scope])] : prev.filter((s) => s !== scope),
                      )
                    }
                  />
                  <span>{SCOPE_LABELS[scope]}</span>
                </label>
              ))}
            </div>

            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• Grants last 14 days, then expire on their own</li>
              <li>• We end access as soon as your setup is finished</li>
              <li>• Only what you tick above — never your password, billing or mailbox login</li>
              <li>• Every action we take is recorded below</li>
            </ul>

            <Button onClick={handleGrant} disabled={busy || chosen.length === 0} className="gap-1.5">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Grant campaign setup access (14 days)
            </Button>
          </>
        )}

        {events.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium">Recent support activity</p>
              <ul className="space-y-1">
                {events.map((e) => (
                  <li key={e.id} className="text-xs text-muted-foreground">
                    {format(new Date(e.created_at), "MMM d, p")} — {e.action}
                    {e.entity_type ? ` (${e.entity_type})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </PanelBody>
    </Panel>
  );
};

export default SupportAccessCard;
