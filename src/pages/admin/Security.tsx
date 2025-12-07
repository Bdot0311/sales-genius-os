import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Ban, AlertTriangle, Activity, Plus, Trash2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface BlockedIP {
  id: string;
  ip_address: string;
  reason: string | null;
  blocked_at: string;
  expires_at: string | null;
  is_active: boolean;
}

interface SuspiciousActivity {
  id: string;
  user_id: string;
  user_email?: string;
  action: string;
  entity_type: string;
  ip_address: string | null;
  created_at: string;
}

interface RateLimitBucket {
  id: string;
  api_key_id: string;
  endpoint: string;
  tokens: number;
  last_refill_at: string;
}

const AdminSecurity = () => {
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [suspiciousActivities, setSuspiciousActivities] = useState<SuspiciousActivity[]>([]);
  const [rateLimitBuckets, setRateLimitBuckets] = useState<RateLimitBucket[]>([]);
  const [newIP, setNewIP] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAllData();
    
    // Set up real-time subscription for blocked IPs
    const channel = supabase
      .channel('security-updates')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocked_ips' },
        () => loadBlockedIPs()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([
      loadBlockedIPs(),
      loadSuspiciousActivities(),
      loadRateLimitBuckets()
    ]);
    setLoading(false);
  };

  const loadBlockedIPs = async () => {
    const { data, error } = await supabase
      .from('blocked_ips')
      .select('*')
      .eq('is_active', true)
      .order('blocked_at', { ascending: false });

    if (error) {
      console.error('Error loading blocked IPs:', error);
      return;
    }
    setBlockedIPs(data || []);
  };

  const loadSuspiciousActivities = async () => {
    // Get recent audit logs that might indicate suspicious activity
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .in('action', ['deleted', 'lock_account', 'failed_login'])
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading suspicious activities:', error);
      return;
    }

    // Enrich with user emails
    const enrichedActivities = await Promise.all(
      (data || []).map(async (activity) => {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', activity.user_id)
          .maybeSingle();
        
        return {
          ...activity,
          user_email: profile?.email || 'Unknown',
        };
      })
    );

    setSuspiciousActivities(enrichedActivities);
  };

  const loadRateLimitBuckets = async () => {
    const { data, error } = await supabase
      .from('rate_limit_buckets')
      .select('*')
      .order('last_refill_at', { ascending: false })
      .limit(20);

    if (error) {
      console.error('Error loading rate limit buckets:', error);
      return;
    }
    setRateLimitBuckets(data || []);
  };

  const handleBlockIP = async () => {
    if (!newIP.trim()) {
      toast.error("Please enter an IP address");
      return;
    }

    const { error } = await supabase
      .from('blocked_ips')
      .insert({
        ip_address: newIP.trim(),
        reason: blockReason || 'Manual block by admin'
      });

    if (error) {
      toast.error('Failed to block IP');
      return;
    }

    toast.success(`IP ${newIP} has been blocked`);
    setNewIP("");
    setBlockReason("");
    loadBlockedIPs();
  };

  const handleUnblockIP = async (id: string) => {
    const { error } = await supabase
      .from('blocked_ips')
      .update({ is_active: false })
      .eq('id', id);

    if (error) {
      toast.error('Failed to unblock IP');
      return;
    }

    toast.success("IP has been unblocked");
    loadBlockedIPs();
  };

  const getActivitySeverity = (action: string): 'low' | 'medium' | 'high' => {
    switch (action) {
      case 'failed_login': return 'high';
      case 'deleted': return 'medium';
      case 'lock_account': return 'high';
      default: return 'low';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-destructive text-destructive-foreground';
      case 'medium': return 'bg-amber-500 text-white';
      case 'low': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Shield className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold">Security Center</h2>
          <p className="text-muted-foreground">Manage rate limits, IP blocking, and monitor suspicious activity</p>
        </div>
      </div>

      <Tabs defaultValue="rate-limits" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
          <TabsTrigger value="rate-limits" className="gap-2">
            <Activity className="h-4 w-4" />
            Rate Limits
          </TabsTrigger>
          <TabsTrigger value="ip-blocking" className="gap-2">
            <Ban className="h-4 w-4" />
            IP Blocking ({blockedIPs.length})
          </TabsTrigger>
          <TabsTrigger value="suspicious" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Suspicious Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rate-limits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Active Rate Limit Buckets</CardTitle>
              <CardDescription>Current token bucket state for API rate limiting</CardDescription>
            </CardHeader>
            <CardContent>
              {rateLimitBuckets.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active rate limit buckets</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>API Key ID</TableHead>
                      <TableHead>Endpoint</TableHead>
                      <TableHead>Tokens Remaining</TableHead>
                      <TableHead>Last Refill</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rateLimitBuckets.map((bucket) => (
                      <TableRow key={bucket.id}>
                        <TableCell className="font-mono text-xs">
                          {bucket.api_key_id.slice(0, 8)}...
                        </TableCell>
                        <TableCell className="font-mono text-sm">{bucket.endpoint}</TableCell>
                        <TableCell>
                          <Badge variant={bucket.tokens > 10 ? "default" : "destructive"}>
                            {bucket.tokens} tokens
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(bucket.last_refill_at), 'MMM d, HH:mm')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ip-blocking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Block IP Address</CardTitle>
              <CardDescription>Add IP addresses to the blocklist</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4">
                <div className="flex-1">
                  <Label htmlFor="ip">IP Address</Label>
                  <Input
                    id="ip"
                    placeholder="e.g., 192.168.1.1"
                    value={newIP}
                    onChange={(e) => setNewIP(e.target.value)}
                  />
                </div>
                <div className="flex-1">
                  <Label htmlFor="reason">Reason</Label>
                  <Input
                    id="reason"
                    placeholder="Reason for blocking"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button onClick={handleBlockIP} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Block IP
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Blocked IP Addresses</CardTitle>
              <CardDescription>{blockedIPs.length} IP addresses currently blocked</CardDescription>
            </CardHeader>
            <CardContent>
              {blockedIPs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Ban className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No blocked IP addresses</p>
                </div>
              ) : (
                <ScrollArea className="h-[300px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Reason</TableHead>
                        <TableHead>Blocked At</TableHead>
                        <TableHead>Expires</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {blockedIPs.map((ip) => (
                        <TableRow key={ip.id}>
                          <TableCell className="font-mono">{ip.ip_address}</TableCell>
                          <TableCell>{ip.reason || 'No reason provided'}</TableCell>
                          <TableCell>{format(new Date(ip.blocked_at), 'MMM d, yyyy HH:mm')}</TableCell>
                          <TableCell>
                            {ip.expires_at ? format(new Date(ip.expires_at), 'MMM d, yyyy') : 'Never'}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnblockIP(ip.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspicious" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Suspicious Activity Monitor</CardTitle>
                <CardDescription>Recent activities that may indicate security threats</CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={loadSuspiciousActivities} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              {suspiciousActivities.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No suspicious activities detected</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-4">
                    {suspiciousActivities.map((activity) => {
                      const severity = getActivitySeverity(activity.action);
                      return (
                        <div
                          key={activity.id}
                          className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                        >
                          <div className={`p-2 rounded-full ${getSeverityColor(severity)}`}>
                            <AlertTriangle className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">
                                {activity.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                              </span>
                              <Badge className={getSeverityColor(severity)}>
                                {severity}
                              </Badge>
                              <Badge variant="outline">{activity.entity_type}</Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>User: {activity.user_email}</span>
                              {activity.ip_address && <span>IP: {activity.ip_address}</span>}
                              <span>{format(new Date(activity.created_at), 'MMM d, yyyy HH:mm')}</span>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button variant="outline" size="sm">Investigate</Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSecurity;
