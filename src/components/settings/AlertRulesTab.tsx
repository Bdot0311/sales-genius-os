import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Bell, Plus, Trash2, Loader2, Settings2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";

interface AlertRule {
  id: string;
  name: string;
  metric_type: string;
  threshold_value: number;
  comparison_operator: string;
  time_window_minutes: number;
  notification_channels: string[];
  notification_webhook_url: string | null;
  is_active: boolean;
  last_triggered_at: string | null;
  trigger_count: number;
  created_at: string;
}

export const AlertRulesTab = () => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [newRule, setNewRule] = useState({
    name: "",
    metric_type: "error_rate",
    threshold_value: "",
    comparison_operator: "greater_than",
    time_window_minutes: "60",
    notification_channels: ["email"] as string[],
    notification_webhook_url: "",
  });

  useEffect(() => {
    loadRules();
  }, []);

  const loadRules = async () => {
    try {
      const { data, error } = await supabase
        .from("alert_rules")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setRules(data || []);
    } catch (error) {
      console.error("Error loading alert rules:", error);
      toast.error("Failed to load alert rules");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newRule.name.trim() || !newRule.threshold_value) {
      toast.error("Please fill in all required fields");
      return;
    }

    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("alert_rules").insert({
        user_id: user.id,
        name: newRule.name,
        metric_type: newRule.metric_type,
        threshold_value: parseFloat(newRule.threshold_value),
        comparison_operator: newRule.comparison_operator,
        time_window_minutes: parseInt(newRule.time_window_minutes),
        notification_channels: newRule.notification_channels,
        notification_webhook_url: newRule.notification_webhook_url || null,
      });

      if (error) throw error;

      toast.success("Alert rule created");
      setShowCreateDialog(false);
      setNewRule({
        name: "",
        metric_type: "error_rate",
        threshold_value: "",
        comparison_operator: "greater_than",
        time_window_minutes: "60",
        notification_channels: ["email"],
        notification_webhook_url: "",
      });
      await loadRules();
    } catch (error: any) {
      console.error("Error creating alert rule:", error);
      toast.error(error.message || "Failed to create alert rule");
    } finally {
      setCreating(false);
    }
  };

  const handleToggle = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from("alert_rules")
        .update({ is_active: !currentStatus })
        .eq("id", id);

      if (error) throw error;

      await loadRules();
      toast.success(`Alert rule ${!currentStatus ? "enabled" : "disabled"}`);
    } catch (error) {
      console.error("Error toggling alert rule:", error);
      toast.error("Failed to update alert rule");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("alert_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;

      await loadRules();
      toast.success("Alert rule deleted");
    } catch (error) {
      console.error("Error deleting alert rule:", error);
      toast.error("Failed to delete alert rule");
    } finally {
      setDeleteRuleId(null);
    }
  };

  const handleChannelToggle = (channel: string) => {
    setNewRule(prev => ({
      ...prev,
      notification_channels: prev.notification_channels.includes(channel)
        ? prev.notification_channels.filter(c => c !== channel)
        : [...prev.notification_channels, channel]
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Custom Alert Rules
              </CardTitle>
              <CardDescription>
                Set custom thresholds and get notified when metrics exceed limits
              </CardDescription>
            </div>
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {rules.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No alert rules yet. Create one to get started.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {rules.map((rule) => (
                <div key={rule.id} className="flex items-start justify-between p-4 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h4 className="font-semibold">{rule.name}</h4>
                      <Badge variant={rule.is_active ? "default" : "secondary"}>
                        {rule.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <div className="text-sm text-muted-foreground mt-2">
                      <p>
                        <strong>{rule.metric_type.replace(/_/g, ' ')}:</strong>{" "}
                        {rule.comparison_operator.replace(/_/g, ' ')} {rule.threshold_value}
                        {rule.metric_type.includes('rate') ? '%' : ''}
                      </p>
                      <p>Time window: {rule.time_window_minutes} minutes</p>
                      <p>Channels: {rule.notification_channels.join(', ')}</p>
                    </div>
                    {rule.last_triggered_at && (
                      <div className="text-xs text-muted-foreground mt-2">
                        Last triggered: {new Date(rule.last_triggered_at).toLocaleString()} 
                        ({rule.trigger_count} times)
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggle(rule.id, rule.is_active)}
                    >
                      {rule.is_active ? "Disable" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDeleteRuleId(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Alert Rule</DialogTitle>
            <DialogDescription>
              Set up custom alerts for your API metrics
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Rule Name</Label>
              <Input
                id="name"
                placeholder="High Error Rate Alert"
                value={newRule.name}
                onChange={(e) => setNewRule({ ...newRule, name: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="metric">Metric Type</Label>
                <Select value={newRule.metric_type} onValueChange={(value) => setNewRule({ ...newRule, metric_type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="error_rate">Error Rate (%)</SelectItem>
                    <SelectItem value="response_time">Response Time (ms)</SelectItem>
                    <SelectItem value="request_volume">Request Volume</SelectItem>
                    <SelectItem value="webhook_failure">Webhook Failure Rate (%)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="operator">Condition</Label>
                <Select value={newRule.comparison_operator} onValueChange={(value) => setNewRule({ ...newRule, comparison_operator: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="greater_than">Greater Than</SelectItem>
                    <SelectItem value="less_than">Less Than</SelectItem>
                    <SelectItem value="equals">Equals</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="threshold">Threshold Value</Label>
                <Input
                  id="threshold"
                  type="number"
                  placeholder="5"
                  value={newRule.threshold_value}
                  onChange={(e) => setNewRule({ ...newRule, threshold_value: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="window">Time Window (minutes)</Label>
                <Input
                  id="window"
                  type="number"
                  placeholder="60"
                  value={newRule.time_window_minutes}
                  onChange={(e) => setNewRule({ ...newRule, time_window_minutes: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Notification Channels</Label>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="email"
                    checked={newRule.notification_channels.includes('email')}
                    onCheckedChange={() => handleChannelToggle('email')}
                  />
                  <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Email
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="webhook"
                    checked={newRule.notification_channels.includes('webhook')}
                    onCheckedChange={() => handleChannelToggle('webhook')}
                  />
                  <label htmlFor="webhook" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                    Webhook
                  </label>
                </div>
              </div>
            </div>

            {newRule.notification_channels.includes('webhook') && (
              <div className="space-y-2">
                <Label htmlFor="webhookUrl">Webhook URL</Label>
                <Input
                  id="webhookUrl"
                  type="url"
                  placeholder="https://your-server.com/webhook"
                  value={newRule.notification_webhook_url}
                  onChange={(e) => setNewRule({ ...newRule, notification_webhook_url: e.target.value })}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating}>
              {creating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Rule"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteRuleId} onOpenChange={() => setDeleteRuleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Alert Rule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this alert rule. You will no longer receive notifications based on this rule.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteRuleId && handleDelete(deleteRuleId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
