import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, Mail, Save, Trash2, CheckCircle2, ExternalLink } from "lucide-react";
import type { AgentConfig } from "@/pages/Agent";

interface SettingsTabProps {
  config: AgentConfig | null;
  userId: string | null;
  gmailConnected: boolean;
  onSaved: (config: AgentConfig) => void;
  onDataReset: () => Promise<void>;
}

export function SettingsTab({
  config,
  userId,
  gmailConnected,
  onSaved,
  onDataReset,
}: SettingsTabProps) {
  const [maxDailyReplies, setMaxDailyReplies] = useState<number>(
    config?.max_daily_auto_replies ?? 20
  );
  const [replyDelay, setReplyDelay] = useState<number>(
    config?.reply_delay_minutes ?? 15
  );
  const [savingLimits, setSavingLimits] = useState(false);
  const [connectingGmail, setConnectingGmail] = useState(false);
  const [resetting, setResetting] = useState(false);

  const handleConnectGmail = async () => {
    setConnectingGmail(true);
    try {
      const redirectUri =
        window.location.origin + "/settings?tab=integrations";
      const { data, error } = await supabase.functions.invoke(
        "google-oauth-init",
        { body: { redirectUri } }
      );
      if (error) throw error;
      const oauthUrl = (data as { url?: string } | null)?.url;
      if (!oauthUrl) throw new Error("No OAuth URL returned");
      window.location.href = oauthUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Gmail connect failed: ${message}`);
      setConnectingGmail(false);
    }
  };

  const handleSaveLimits = async () => {
    if (!userId) {
      toast.error("Not authenticated");
      return;
    }
    setSavingLimits(true);
    try {
      const clampedMax = Math.min(100, Math.max(1, maxDailyReplies));
      const clampedDelay = Math.min(120, Math.max(5, replyDelay));

      const payload: Record<string, unknown> = {
        user_id: userId,
        max_daily_auto_replies: clampedMax,
        reply_delay_minutes: clampedDelay,
      };
      if (config?.id) payload.id = config.id;

      const { data, error } = await (supabase as any)
        .from("agent_configs")
        .upsert(payload, { onConflict: "user_id" })
        .select("*")
        .maybeSingle();

      if (error) throw error;
      onSaved(data as AgentConfig);
      toast.success("Agent limits saved");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save: ${message}`);
    } finally {
      setSavingLimits(false);
    }
  };

  const handleResetData = async () => {
    if (!userId) {
      toast.error("Not authenticated");
      return;
    }
    setResetting(true);
    try {
      const { error } = await (supabase as any)
        .from("agent_actions")
        .delete()
        .eq("user_id", userId);
      if (error) throw error;
      toast.success("Agent data reset successfully");
      await onDataReset();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Reset failed: ${message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      {/* Connected email */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">
            Connected Email Account
          </CardTitle>
        </CardHeader>
        <CardContent>
          {gmailConnected ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/10">
                  <Mail className="w-5 h-5 text-green-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">Gmail</p>
                    <Badge
                      variant="outline"
                      className="bg-green-500/15 text-green-400 border-green-500/30 text-xs px-1.5 py-0"
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Connected
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Your Gmail account is connected and the agent can read/send emails
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  (window.location.href = "/settings?tab=integrations")
                }
                className="gap-1.5 flex-shrink-0"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Manage
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted/50">
                  <Mail className="w-5 h-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-sm font-medium">Gmail not connected</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Connect Gmail so the agent can monitor and reply to prospect threads
                  </p>
                </div>
              </div>
              <Button
                onClick={handleConnectGmail}
                disabled={connectingGmail}
                size="sm"
                className="gap-2 flex-shrink-0"
              >
                {connectingGmail ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Mail className="w-4 h-4" />
                )}
                {connectingGmail ? "Connecting…" : "Connect Gmail"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Agent Limits */}
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold">Agent Limits</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="max-daily-replies">
                Max daily auto-replies{" "}
                <span className="text-muted-foreground font-normal">(1–100)</span>
              </Label>
              <Input
                id="max-daily-replies"
                type="number"
                min={1}
                max={100}
                value={maxDailyReplies}
                onChange={(e) =>
                  setMaxDailyReplies(
                    Math.min(100, Math.max(1, parseInt(e.target.value, 10) || 1))
                  )
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reply-delay">
                Reply delay{" "}
                <span className="text-muted-foreground font-normal">
                  (minutes, 5–120)
                </span>
              </Label>
              <Input
                id="reply-delay"
                type="number"
                min={5}
                max={120}
                value={replyDelay}
                onChange={(e) =>
                  setReplyDelay(
                    Math.min(120, Math.max(5, parseInt(e.target.value, 10) || 5))
                  )
                }
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              onClick={handleSaveLimits}
              disabled={savingLimits}
              size="sm"
              className="gap-2"
            >
              {savingLimits ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {savingLimits ? "Saving…" : "Save Limits"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-destructive">
            Danger Zone
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">Reset all agent data</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Permanently deletes all agent action history for your account.
                This cannot be undone.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={resetting}
                  className="gap-2 flex-shrink-0"
                >
                  {resetting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                  {resetting ? "Resetting…" : "Reset Data"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset all agent data?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all agent action history
                    (replies sent, meetings booked, etc.) for your account.
                    Your configuration will be preserved. This action cannot be
                    undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleResetData}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, reset data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
