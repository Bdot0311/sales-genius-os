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

interface RateLimitConfig {
  id: string;
  endpoint: string;
  requests_per_minute: number;
  requests_per_day: number;
  is_enabled: boolean;
}

interface BlockedIP {
  id: string;
  ip_address: string;
  reason: string;
  blocked_at: string;
  expires_at: string | null;
}

interface SuspiciousActivity {
  id: string;
  user_id: string;
  user_email: string;
  activity_type: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  detected_at: string;
}

const AdminSecurity = () => {
  const [newIP, setNewIP] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [loading, setLoading] = useState(false);

  // Mock data for demonstration - in production, these would come from database
  const [rateLimits] = useState<RateLimitConfig[]>([
    { id: '1', endpoint: '/api/leads', requests_per_minute: 60, requests_per_day: 10000, is_enabled: true },
    { id: '2', endpoint: '/api/deals', requests_per_minute: 60, requests_per_day: 10000, is_enabled: true },
    { id: '3', endpoint: '/api/webhooks', requests_per_minute: 30, requests_per_day: 5000, is_enabled: true },
    { id: '4', endpoint: '/api/enrichment', requests_per_minute: 10, requests_per_day: 1000, is_enabled: true },
  ]);

  const [blockedIPs, setBlockedIPs] = useState<BlockedIP[]>([
    { id: '1', ip_address: '192.168.1.100', reason: 'Brute force attempt', blocked_at: new Date().toISOString(), expires_at: null },
    { id: '2', ip_address: '10.0.0.50', reason: 'Suspicious scraping activity', blocked_at: new Date(Date.now() - 86400000).toISOString(), expires_at: new Date(Date.now() + 86400000 * 7).toISOString() },
  ]);

  const [suspiciousActivities] = useState<SuspiciousActivity[]>([
    { id: '1', user_id: '123', user_email: 'user@example.com', activity_type: 'multiple_failed_logins', description: '15 failed login attempts in 5 minutes', severity: 'high', detected_at: new Date().toISOString() },
    { id: '2', user_id: '456', user_email: 'another@example.com', activity_type: 'unusual_access_pattern', description: 'Access from 3 different countries within 1 hour', severity: 'medium', detected_at: new Date(Date.now() - 3600000).toISOString() },
    { id: '3', user_id: '789', user_email: 'test@example.com', activity_type: 'mass_data_export', description: 'Attempted to export 10,000+ records', severity: 'medium', detected_at: new Date(Date.now() - 7200000).toISOString() },
  ]);

  const handleBlockIP = () => {
    if (!newIP.trim()) {
      toast.error("Please enter an IP address");
      return;
    }
    
    const newBlock: BlockedIP = {
      id: Date.now().toString(),
      ip_address: newIP,
      reason: blockReason || 'Manual block',
      blocked_at: new Date().toISOString(),
      expires_at: null
    };
    
    setBlockedIPs(prev => [...prev, newBlock]);
    setNewIP("");
    setBlockReason("");
    toast.success(`IP ${newIP} has been blocked`);
  };

  const handleUnblockIP = (id: string) => {
    setBlockedIPs(prev => prev.filter(ip => ip.id !== id));
    toast.success("IP has been unblocked");
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'bg-destructive text-destructive-foreground';
      case 'medium': return 'bg-amber-500 text-white';
      case 'low': return 'bg-muted text-muted-foreground';
      default: return 'bg-muted text-muted-foreground';
    }
  };

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
            IP Blocking
          </TabsTrigger>
          <TabsTrigger value="suspicious" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Suspicious Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="rate-limits" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>API Rate Limits</CardTitle>
              <CardDescription>Configure rate limiting for different API endpoints</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Requests/Min</TableHead>
                    <TableHead>Requests/Day</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rateLimits.map((limit) => (
                    <TableRow key={limit.id}>
                      <TableCell className="font-mono text-sm">{limit.endpoint}</TableCell>
                      <TableCell>{limit.requests_per_minute}</TableCell>
                      <TableCell>{limit.requests_per_day.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant={limit.is_enabled ? "default" : "secondary"}>
                          {limit.is_enabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Switch checked={limit.is_enabled} />
                          <Button variant="ghost" size="sm">Edit</Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
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
                        <TableCell>{ip.reason}</TableCell>
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
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="suspicious" className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Suspicious Activity Monitor</CardTitle>
                <CardDescription>Real-time detection of potential security threats</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px]">
                <div className="space-y-4">
                  {suspiciousActivities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                    >
                      <div className={`p-2 rounded-full ${getSeverityColor(activity.severity)}`}>
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium">{activity.activity_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</span>
                          <Badge className={getSeverityColor(activity.severity)}>
                            {activity.severity}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">{activity.description}</p>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span>User: {activity.user_email}</span>
                          <span>{format(new Date(activity.detected_at), 'MMM d, yyyy HH:mm')}</span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">Investigate</Button>
                        <Button variant="destructive" size="sm">Block User</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminSecurity;
