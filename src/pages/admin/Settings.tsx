import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Settings, CreditCard, Key, Mail, Flag, Plus, Pencil, Trash2, Loader2, Save } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";

interface AdminSetting {
  id: string;
  setting_key: string;
  setting_value: Json;
  description: string | null;
  category: string;
}

interface FeatureFlag {
  id: string;
  name: string;
  description: string | null;
  is_enabled: boolean;
  rollout_percentage: number | null;
  target_plans: string[] | null;
}

const PLAN_OPTIONS = ["starter", "growth", "pro"];

const AdminSettings = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AdminSetting[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [isAddFlagOpen, setIsAddFlagOpen] = useState(false);
  const [newFlag, setNewFlag] = useState({
    name: "",
    description: "",
    is_enabled: false,
    rollout_percentage: 100,
    target_plans: ["starter", "growth", "pro"] as string[]
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [settingsRes, flagsRes] = await Promise.all([
        supabase.from("admin_settings").select("*").order("category, setting_key"),
        supabase.from("feature_flags").select("*").order("name")
      ]);

      if (settingsRes.error) throw settingsRes.error;
      if (flagsRes.error) throw flagsRes.error;

      setSettings(settingsRes.data || []);
      setFeatureFlags(flagsRes.data || []);
    } catch (error) {
      console.error("Error loading admin settings:", error);
      toast({
        title: "Error loading settings",
        description: "Could not load admin settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getSettingValue = (key: string): Json => {
    const setting = settings.find(s => s.setting_key === key);
    return setting?.setting_value ?? null;
  };

  const updateSetting = async (key: string, value: Json) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from("admin_settings")
        .update({ setting_value: value, updated_at: new Date().toISOString() })
        .eq("setting_key", key);

      if (error) throw error;

      setSettings(prev => prev.map(s => 
        s.setting_key === key ? { ...s, setting_value: value } : s
      ));

      toast({ title: "Setting updated", description: `${key} has been updated` });
    } catch (error) {
      console.error("Error updating setting:", error);
      toast({
        title: "Error updating setting",
        description: "Could not save the setting",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleFeatureFlag = async (flag: FeatureFlag) => {
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({ is_enabled: !flag.is_enabled, updated_at: new Date().toISOString() })
        .eq("id", flag.id);

      if (error) throw error;

      setFeatureFlags(prev => prev.map(f => 
        f.id === flag.id ? { ...f, is_enabled: !f.is_enabled } : f
      ));

      toast({ title: "Feature flag updated" });
    } catch (error) {
      console.error("Error toggling feature flag:", error);
      toast({
        title: "Error updating feature flag",
        variant: "destructive"
      });
    }
  };

  const saveFeatureFlag = async (flag: FeatureFlag) => {
    try {
      const { error } = await supabase
        .from("feature_flags")
        .update({
          name: flag.name,
          description: flag.description,
          rollout_percentage: flag.rollout_percentage,
          target_plans: flag.target_plans,
          updated_at: new Date().toISOString()
        })
        .eq("id", flag.id);

      if (error) throw error;

      setFeatureFlags(prev => prev.map(f => f.id === flag.id ? flag : f));
      setEditingFlag(null);
      toast({ title: "Feature flag saved" });
    } catch (error) {
      console.error("Error saving feature flag:", error);
      toast({
        title: "Error saving feature flag",
        variant: "destructive"
      });
    }
  };

  const createFeatureFlag = async () => {
    if (!newFlag.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase
        .from("feature_flags")
        .insert({
          name: newFlag.name,
          description: newFlag.description || null,
          is_enabled: newFlag.is_enabled,
          rollout_percentage: newFlag.rollout_percentage,
          target_plans: newFlag.target_plans
        })
        .select()
        .single();

      if (error) throw error;

      setFeatureFlags(prev => [...prev, data]);
      setIsAddFlagOpen(false);
      setNewFlag({
        name: "",
        description: "",
        is_enabled: false,
        rollout_percentage: 100,
        target_plans: ["growth", "pro", "elite"]
      });
      toast({ title: "Feature flag created" });
    } catch (error) {
      console.error("Error creating feature flag:", error);
      toast({
        title: "Error creating feature flag",
        variant: "destructive"
      });
    }
  };

  const deleteFeatureFlag = async (id: string) => {
    try {
      const { error } = await supabase
        .from("feature_flags")
        .delete()
        .eq("id", id);

      if (error) throw error;

      setFeatureFlags(prev => prev.filter(f => f.id !== id));
      toast({ title: "Feature flag deleted" });
    } catch (error) {
      console.error("Error deleting feature flag:", error);
      toast({
        title: "Error deleting feature flag",
        variant: "destructive"
      });
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Admin Settings
        </CardTitle>
        <CardDescription>Configure system-wide settings and feature flags</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="general" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="general" className="flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">General</span>
            </TabsTrigger>
            <TabsTrigger value="billing" className="flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Billing</span>
            </TabsTrigger>
            <TabsTrigger value="api" className="flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">API</span>
            </TabsTrigger>
            <TabsTrigger value="email" className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Email</span>
            </TabsTrigger>
            <TabsTrigger value="features" className="flex items-center gap-1.5">
              <Flag className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Features</span>
            </TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general" className="space-y-4">
            <div className="grid gap-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-base">Maintenance Mode</Label>
                  <p className="text-sm text-muted-foreground">Disable access for non-admin users</p>
                </div>
                <Switch
                  checked={getSettingValue("maintenance_mode") === true}
                  onCheckedChange={(checked) => updateSetting("maintenance_mode", checked)}
                  disabled={saving}
                />
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="maintenance-message">Maintenance Message</Label>
                <Textarea
                  id="maintenance-message"
                  placeholder="We're currently performing scheduled maintenance..."
                  value={(getSettingValue("maintenance_message") as string) || ""}
                  onChange={(e) => updateSetting("maintenance_message", e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <Label className="text-base">User Signups Enabled</Label>
                  <p className="text-sm text-muted-foreground">Allow new user registrations</p>
                </div>
                <Switch
                  checked={getSettingValue("signup_enabled") !== false}
                  onCheckedChange={(checked) => updateSetting("signup_enabled", checked)}
                  disabled={saving}
                />
              </div>
            </div>
          </TabsContent>

          {/* Billing Settings */}
          <TabsContent value="billing" className="space-y-4">
            <div className="grid gap-4">
              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="trial-days">Default Trial Period (days)</Label>
                <Input
                  id="trial-days"
                  type="number"
                  min={1}
                  max={365}
                  value={(getSettingValue("default_trial_days") as number) || 14}
                  onChange={(e) => updateSetting("default_trial_days", parseInt(e.target.value) || 14)}
                  disabled={saving}
                />
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="growth-leads">Max Leads - Growth Plan</Label>
                <Input
                  id="growth-leads"
                  type="number"
                  min={100}
                  value={(getSettingValue("max_leads_growth") as number) || 1000}
                  onChange={(e) => updateSetting("max_leads_growth", parseInt(e.target.value) || 1000)}
                  disabled={saving}
                />
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="pro-leads">Max Leads - Pro Plan</Label>
                <Input
                  id="pro-leads"
                  type="number"
                  min={100}
                  value={(getSettingValue("max_leads_pro") as number) || 10000}
                  onChange={(e) => updateSetting("max_leads_pro", parseInt(e.target.value) || 10000)}
                  disabled={saving}
                />
              </div>
            </div>
          </TabsContent>

          {/* API Settings */}
          <TabsContent value="api" className="space-y-4">
            <div className="grid gap-4">
              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="rate-limit-minute">Default Rate Limit (per minute)</Label>
                <Input
                  id="rate-limit-minute"
                  type="number"
                  min={1}
                  value={(getSettingValue("default_rate_limit_minute") as number) || 60}
                  onChange={(e) => updateSetting("default_rate_limit_minute", parseInt(e.target.value) || 60)}
                  disabled={saving}
                />
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="rate-limit-day">Default Rate Limit (per day)</Label>
                <Input
                  id="rate-limit-day"
                  type="number"
                  min={1}
                  value={(getSettingValue("default_rate_limit_day") as number) || 10000}
                  onChange={(e) => updateSetting("default_rate_limit_day", parseInt(e.target.value) || 10000)}
                  disabled={saving}
                />
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="webhook-retries">Max Webhook Retry Attempts</Label>
                <Input
                  id="webhook-retries"
                  type="number"
                  min={1}
                  max={10}
                  value={(getSettingValue("max_webhook_retries") as number) || 5}
                  onChange={(e) => updateSetting("max_webhook_retries", parseInt(e.target.value) || 5)}
                  disabled={saving}
                />
              </div>
            </div>
          </TabsContent>

          {/* Email Settings */}
          <TabsContent value="email" className="space-y-4">
            <div className="grid gap-4">
              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="email-from">Sender Email Address</Label>
                <Input
                  id="email-from"
                  type="email"
                  placeholder="noreply@salesos.io"
                  value={(getSettingValue("email_from_address") as string) || ""}
                  onChange={(e) => updateSetting("email_from_address", e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="p-4 border rounded-lg space-y-3">
                <Label htmlFor="email-name">Sender Name</Label>
                <Input
                  id="email-name"
                  placeholder="SalesOS"
                  value={(getSettingValue("email_from_name") as string) || ""}
                  onChange={(e) => updateSetting("email_from_name", e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
          </TabsContent>

          {/* Feature Flags */}
          <TabsContent value="features" className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Manage feature rollouts and A/B testing
              </p>
              <Dialog open={isAddFlagOpen} onOpenChange={setIsAddFlagOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Flag
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Create Feature Flag</DialogTitle>
                    <DialogDescription>Add a new feature flag to control feature rollouts</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label htmlFor="flag-name">Name</Label>
                      <Input
                        id="flag-name"
                        value={newFlag.name}
                        onChange={(e) => setNewFlag(prev => ({ ...prev, name: e.target.value }))}
                        placeholder="new_dashboard_ui"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="flag-desc">Description</Label>
                      <Textarea
                        id="flag-desc"
                        value={newFlag.description}
                        onChange={(e) => setNewFlag(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Enable the new dashboard interface"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={newFlag.is_enabled}
                        onCheckedChange={(checked) => setNewFlag(prev => ({ ...prev, is_enabled: checked }))}
                      />
                      <Label>Enabled</Label>
                    </div>
                    <div className="space-y-2">
                      <Label>Rollout Percentage: {newFlag.rollout_percentage}%</Label>
                      <Slider
                        value={[newFlag.rollout_percentage]}
                        onValueChange={([value]) => setNewFlag(prev => ({ ...prev, rollout_percentage: value }))}
                        max={100}
                        step={1}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Plans</Label>
                      <div className="flex gap-4">
                        {PLAN_OPTIONS.map(plan => (
                          <label key={plan} className="flex items-center gap-2 capitalize">
                            <Checkbox
                              checked={newFlag.target_plans.includes(plan)}
                              onCheckedChange={(checked) => {
                                setNewFlag(prev => ({
                                  ...prev,
                                  target_plans: checked
                                    ? [...prev.target_plans, plan]
                                    : prev.target_plans.filter(p => p !== plan)
                                }));
                              }}
                            />
                            {plan}
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddFlagOpen(false)}>Cancel</Button>
                    <Button onClick={createFeatureFlag}>Create Flag</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Feature</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Rollout</TableHead>
                    <TableHead>Plans</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {featureFlags.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        No feature flags configured
                      </TableCell>
                    </TableRow>
                  ) : (
                    featureFlags.map((flag) => (
                      <TableRow key={flag.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">{flag.name}</p>
                            {flag.description && (
                              <p className="text-xs text-muted-foreground">{flag.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Switch
                            checked={flag.is_enabled}
                            onCheckedChange={() => toggleFeatureFlag(flag)}
                          />
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary">{flag.rollout_percentage ?? 100}%</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 flex-wrap">
                            {(flag.target_plans || []).map(plan => (
                              <Badge key={plan} variant="outline" className="text-xs capitalize">
                                {plan}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => setEditingFlag({ ...flag })}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </DialogTrigger>
                              <DialogContent>
                                <DialogHeader>
                                  <DialogTitle>Edit Feature Flag</DialogTitle>
                                </DialogHeader>
                                {editingFlag && editingFlag.id === flag.id && (
                                  <div className="space-y-4 py-4">
                                    <div className="space-y-2">
                                      <Label>Name</Label>
                                      <Input
                                        value={editingFlag.name}
                                        onChange={(e) => setEditingFlag(prev => prev ? { ...prev, name: e.target.value } : null)}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Description</Label>
                                      <Textarea
                                        value={editingFlag.description || ""}
                                        onChange={(e) => setEditingFlag(prev => prev ? { ...prev, description: e.target.value } : null)}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Rollout: {editingFlag.rollout_percentage ?? 100}%</Label>
                                      <Slider
                                        value={[editingFlag.rollout_percentage ?? 100]}
                                        onValueChange={([value]) => setEditingFlag(prev => prev ? { ...prev, rollout_percentage: value } : null)}
                                        max={100}
                                        step={1}
                                      />
                                    </div>
                                    <div className="space-y-2">
                                      <Label>Target Plans</Label>
                                      <div className="flex gap-4">
                                        {PLAN_OPTIONS.map(plan => (
                                          <label key={plan} className="flex items-center gap-2 capitalize">
                                            <Checkbox
                                              checked={(editingFlag.target_plans || []).includes(plan)}
                                              onCheckedChange={(checked) => {
                                                setEditingFlag(prev => prev ? {
                                                  ...prev,
                                                  target_plans: checked
                                                    ? [...(prev.target_plans || []), plan]
                                                    : (prev.target_plans || []).filter(p => p !== plan)
                                                } : null);
                                              }}
                                            />
                                            {plan}
                                          </label>
                                        ))}
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <DialogFooter>
                                  <Button onClick={() => editingFlag && saveFeatureFlag(editingFlag)}>
                                    <Save className="h-4 w-4 mr-1" />
                                    Save
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => deleteFeatureFlag(flag.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default AdminSettings;
