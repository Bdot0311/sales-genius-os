import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shield, Ban, AlertTriangle, Activity, Plus, Trash2, RefreshCw, LogIn, Eye, ShieldAlert, Clock, Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";

interface BlockedIP {
  id: string;
  ip_address: string;
  reason: string | null;
  blocked_at: string;
  expires_at: string | null;
  is_active: boolean;
}

interface SecurityEvent {
  id: string;
  event_type: string;
  severity: string;
  user_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  details: unknown;
  created_at: string;
}

interface LoginAttempt {
  id: string;
  user_email: string;
  user_id: string | null;
  status: string;
  ip_address: string | null;
  user_agent: string | null;
  login_method: string;
  created_at: string;
}

interface RateLimitBucket {
  id: string;
  api_key_id: string;
  endpoint: string;
  tokens: number;
  last_refill_at: string;
}

interface SecurityStats {
  totalBlockedIPs: number;
  failedLoginsToday: number;
  securityEventsToday: number;
  rateLimitViolationsToday: number;
}

const AdminSecurity = () => {
  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([]);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [loginAttempts, setLoginAttempts] = useState<LoginAttempt[]>([]);
  const [rateLimitBuckets, setRateLimitBuckets] = useState<RateLimitBucket[]>([]);
  const [stats, setStats] = useState<SecurityStats>({
    totalBlockedIPs: 0,
    failedLoginsToday: 0,
    securityEventsToday: 0,
    rateLimitViolationsToday: 0,
  });
  const [newIP, setNewIP] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const loadStats = useCallback(async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    const [blockedRes, loginRes, eventsRes] = await Promise.all([
      supabase.from('blocked_ips').select('id', { count: 'exact' }).eq('is_active', true),
      supabase.from('login_history').select('id', { count: 'exact' }).eq('status', 'failed').gte('created_at', todayISO),
      supabase.from('security_events').select('id, event_type', { count: 'exact' }).gte('created_at', todayISO),
    ]);

    const rateLimitViolations = (eventsRes.data || []).filter(e => e.event_type === 'rate_limit_exceeded').length;

    setStats({
      totalBlockedIPs: blockedRes.count || 0,
      failedLoginsToday: loginRes.count || 0,
      securityEventsToday: eventsRes.count || 0,
      rateLimitViolationsToday: rateLimitViolations,
    });
  }, []);

  const loadBlockedIPs = useCallback(async () => {
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
  }, []);

  const loadSecurityEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from('security_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading security events:', error);
      return;
    }
    setSecurityEvents(data || []);
  }, []);

  const loadLoginAttempts = useCallback(async () => {
    const { data, error } = await supabase
      .from('login_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading login attempts:', error);
      return;
    }
    setLoginAttempts(data || []);
  }, []);

  const loadRateLimitBuckets = useCallback(async () => {
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
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadBlockedIPs(),
      loadSecurityEvents(),
      loadLoginAttempts(),
      loadRateLimitBuckets(),
      loadStats(),
    ]);
    setLastUpdated(new Date());
    setLoading(false);
  }, [loadBlockedIPs, loadSecurityEvents, loadLoginAttempts, loadRateLimitBuckets, loadStats]);

  useEffect(() => {
    loadAllData();
    
    // Set up real-time subscriptions
    const channel = supabase
      .channel('security-dashboard')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'blocked_ips' },
        () => {
          loadBlockedIPs();
          loadStats();
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'security_events' },
        (payload) => {
          setSecurityEvents(prev => [payload.new as SecurityEvent, ...prev.slice(0, 99)]);
          loadStats();
          // Show toast for critical events
          const event = payload.new as SecurityEvent;
          if (event.severity === 'critical' || event.severity === 'high') {
            toast.warning(`Security Alert: ${event.event_type.replace(/_/g, ' ')}`, {
              description: `IP: ${event.ip_address || 'Unknown'}`,
            });
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'login_history' },
        (payload) => {
          setLoginAttempts(prev => [payload.new as LoginAttempt, ...prev.slice(0, 99)]);
          const attempt = payload.new as LoginAttempt;
          if (attempt.status === 'failed') {
            loadStats();
          }
        }
      )
      .subscribe();

    // Auto-refresh every 30 seconds
    const refreshInterval = setInterval(() => {
      loadStats();
    }, 30000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(refreshInterval);
    };
  }, [loadAllData, loadBlockedIPs, loadStats]);

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
  };

  const getEventSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-destructive text-destructive-foreground';
      case 'high': return 'bg-red-500 text-white';
      case 'medium': return 'bg-amber-500 text-white';
      case 'low': return 'bg-blue-500 text-white';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getLoginStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'bg-green-500 text-white';
      case 'failed': return 'bg-destructive text-destructive-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getEventTypeIcon = (type: string) => {
    switch (type) {
      case 'multiple_failed_logins':
      case 'brute_force_attempt':
        return <Lock className="h-4 w-4" />;
      case 'rate_limit_exceeded':
        return <Activity className="h-4 w-4" />;
      case 'suspicious_activity':
        return <Eye className="h-4 w-4" />;
      case 'bot_attack':
        return <ShieldAlert className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Shield className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Security Center</h2>
            <p className="text-sm text-muted-foreground">
              Real-time security monitoring • Last updated {formatDistanceToNow(lastUpdated, { addSuffix: true })}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={loadAllData} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-destructive/10">
                <Ban className="h-5 w-5 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalBlockedIPs}</p>
                <p className="text-sm text-muted-foreground">Blocked IPs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-red-500/10">
                <LogIn className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.failedLoginsToday}</p>
                <p className="text-sm text-muted-foreground">Failed Logins Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-500/10">
                <ShieldAlert className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.securityEventsToday}</p>
                <p className="text-sm text-muted-foreground">Security Events Today</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-500/10">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.rateLimitViolationsToday}</p>
                <p className="text-sm text-muted-foreground">Rate Limit Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="security-events" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="security-events" className="gap-2">
            <ShieldAlert className="h-4 w-4" />
            Security Events
          </TabsTrigger>
          <TabsTrigger value="login-attempts" className="gap-2">
            <LogIn className="h-4 w-4" />
            Login Attempts
          </TabsTrigger>
          <TabsTrigger value="rate-limits" className="gap-2">
            <Activity className="h-4 w-4" />
            Rate Limits
          </TabsTrigger>
          <TabsTrigger value="ip-blocking" className="gap-2">
            <Ban className="h-4 w-4" />
            IP Blocking ({blockedIPs.length})
          </TabsTrigger>
        </TabsList>

        {/* Security Events Tab */}
        <TabsContent value="security-events" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Security Events</CardTitle>
                  <CardDescription>Real-time security event monitoring</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Live
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {securityEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <ShieldAlert className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No security events recorded</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <div className="space-y-3">
                    {securityEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        <div className={`p-2 rounded-full ${getEventSeverityColor(event.severity)}`}>
                          {getEventTypeIcon(event.event_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="font-medium">
                              {event.event_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                            <Badge className={getEventSeverityColor(event.severity)}>
                              {event.severity}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                            {event.ip_address && <span>IP: {event.ip_address}</span>}
                            {event.user_id && <span className="font-mono text-xs">User: {event.user_id.slice(0, 8)}...</span>}
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(event.created_at), { addSuffix: true })}
                            </span>
                          </div>
                          {event.details && (
                            <pre className="mt-2 text-xs bg-muted p-2 rounded overflow-x-auto">
                              {JSON.stringify(event.details, null, 2)}
                            </pre>
                          )}
                        </div>
                        {event.ip_address && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setNewIP(event.ip_address!);
                              setBlockReason(`Blocked due to: ${event.event_type}`);
                              document.querySelector('[value="ip-blocking"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                            }}
                          >
                            Block IP
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Login Attempts Tab */}
        <TabsContent value="login-attempts" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Login Attempts</CardTitle>
                  <CardDescription>Monitor successful and failed authentication attempts</CardDescription>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                  Live
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loginAttempts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <LogIn className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No login attempts recorded</p>
                </div>
              ) : (
                <ScrollArea className="h-[500px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Status</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>IP Address</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loginAttempts.map((attempt) => (
                        <TableRow key={attempt.id}>
                          <TableCell>
                            <Badge className={getLoginStatusColor(attempt.status)}>
                              {attempt.status === 'success' ? (
                                <><Unlock className="h-3 w-3 mr-1" /> Success</>
                              ) : (
                                <><Lock className="h-3 w-3 mr-1" /> Failed</>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{attempt.user_email}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{attempt.login_method}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{attempt.ip_address || 'Unknown'}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {formatDistanceToNow(new Date(attempt.created_at), { addSuffix: true })}
                          </TableCell>
                          <TableCell>
                            {attempt.ip_address && attempt.status === 'failed' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setNewIP(attempt.ip_address!);
                                  setBlockReason(`Multiple failed logins from: ${attempt.user_email}`);
                                }}
                              >
                                <Ban className="h-4 w-4" />
                              </Button>
                            )}
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

        {/* Rate Limits Tab */}
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

        {/* IP Blocking Tab */}
        <TabsContent value="ip-blocking" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Block IP Address</CardTitle>
              <CardDescription>Add IP addresses to the blocklist</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="ip">IP Address</Label>
                  <Input
                    id="ip"
                    placeholder="e.g., 192.168.1.1"
                    value={newIP}
                    onChange={(e) => setNewIP(e.target.value)}
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
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
      </Tabs>
    </div>
  );
};

export default AdminSecurity;
