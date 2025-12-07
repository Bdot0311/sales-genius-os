import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Search, Filter, Download, User, LogIn, Settings, Database, Shield, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface ActivityLog {
  id: string;
  user_id: string;
  user_email?: string;
  action: string;
  entity_type: string;
  entity_id?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
}

interface LoginEvent {
  id: string;
  user_email: string;
  login_method: string;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
  created_at: string;
}

interface SystemEvent {
  id: string;
  event_type: string;
  description: string;
  severity: string;
  created_at: string;
}

const AdminActivity = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loginEvents, setLoginEvents] = useState<LoginEvent[]>([]);
  const [systemEvents, setSystemEvents] = useState<SystemEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterAction, setFilterAction] = useState("all");
  const [filterEntity, setFilterEntity] = useState("all");

  useEffect(() => {
    loadAllData();

    // Set up real-time subscriptions
    const auditChannel = supabase
      .channel('audit-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'audit_logs' },
        () => loadActivities()
      )
      .subscribe();

    const loginChannel = supabase
      .channel('login-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'login_history' },
        () => loadLoginEvents()
      )
      .subscribe();

    const systemChannel = supabase
      .channel('system-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'system_events' },
        () => loadSystemEvents()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(auditChannel);
      supabase.removeChannel(loginChannel);
      supabase.removeChannel(systemChannel);
    };
  }, []);

  const loadAllData = async () => {
    setLoading(true);
    await Promise.all([loadActivities(), loadLoginEvents(), loadSystemEvents()]);
    setLoading(false);
  };

  const loadActivities = async () => {
    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      console.error('Error loading activities:', error);
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
          id: activity.id,
          user_id: activity.user_id,
          action: activity.action,
          entity_type: activity.entity_type,
          entity_id: activity.entity_id,
          ip_address: activity.ip_address,
          user_agent: activity.user_agent,
          created_at: activity.created_at,
          user_email: profile?.email || 'Unknown',
        };
      })
    );

    setActivities(enrichedActivities);
  };

  const loadLoginEvents = async () => {
    const { data, error } = await supabase
      .from('login_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading login events:', error);
      return;
    }
    setLoginEvents(data || []);
  };

  const loadSystemEvents = async () => {
    const { data, error } = await supabase
      .from('system_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading system events:', error);
      return;
    }
    setSystemEvents(data || []);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'created': return <Database className="h-4 w-4 text-emerald-500" />;
      case 'updated': return <Settings className="h-4 w-4 text-blue-500" />;
      case 'deleted': return <Shield className="h-4 w-4 text-destructive" />;
      case 'login': return <LogIn className="h-4 w-4 text-purple-500" />;
      default: return <Activity className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getActionColor = (action: string) => {
    switch (action) {
      case 'created': return 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
      case 'updated': return 'bg-blue-500/10 text-blue-500 border-blue-500/20';
      case 'deleted': return 'bg-destructive/10 text-destructive border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'error': return 'bg-destructive text-destructive-foreground';
      case 'warning': return 'bg-amber-500 text-white';
      case 'info': return 'bg-blue-500/10 text-blue-500';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const filteredActivities = activities.filter(activity => {
    const matchesSearch = 
      activity.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.entity_type.toLowerCase().includes(searchTerm.toLowerCase()) ||
      activity.action.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = filterAction === 'all' || activity.action === filterAction;
    const matchesEntity = filterEntity === 'all' || activity.entity_type === filterEntity;
    
    return matchesSearch && matchesAction && matchesEntity;
  });

  const uniqueActions = [...new Set(activities.map(a => a.action))];
  const uniqueEntities = [...new Set(activities.map(a => a.entity_type))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Activity className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Activity Logs</h2>
            <p className="text-muted-foreground">Monitor user actions and system events in real-time</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAllData} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      </div>

      <Tabs defaultValue="user-actions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="user-actions" className="gap-2">
            <User className="h-4 w-4" />
            User Actions ({activities.length})
          </TabsTrigger>
          <TabsTrigger value="logins" className="gap-2">
            <LogIn className="h-4 w-4" />
            Logins ({loginEvents.length})
          </TabsTrigger>
          <TabsTrigger value="system" className="gap-2">
            <Settings className="h-4 w-4" />
            System Events ({systemEvents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="user-actions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Actions</CardTitle>
                  <CardDescription>Recent actions performed by users</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-8 w-[200px]"
                    />
                  </div>
                  <Select value={filterAction} onValueChange={setFilterAction}>
                    <SelectTrigger className="w-[130px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Action" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      {uniqueActions.map(action => (
                        <SelectItem key={action} value={action}>{action}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterEntity} onValueChange={setFilterEntity}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue placeholder="Entity" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Entities</SelectItem>
                      {uniqueEntities.map(entity => (
                        <SelectItem key={entity} value={entity}>{entity}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
                ) : filteredActivities.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No activity logs found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredActivities.map((activity) => (
                      <div
                        key={activity.id}
                        className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                      >
                        {getActionIcon(activity.action)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate">{activity.user_email}</span>
                            <Badge variant="outline" className={getActionColor(activity.action)}>
                              {activity.action}
                            </Badge>
                            <Badge variant="secondary">{activity.entity_type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {activity.entity_id && <span className="font-mono text-xs">ID: {activity.entity_id.slice(0, 8)}...</span>}
                            {activity.ip_address && <span className="ml-2">IP: {activity.ip_address}</span>}
                          </p>
                        </div>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(activity.created_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logins" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Login History</CardTitle>
              <CardDescription>User authentication events</CardDescription>
            </CardHeader>
            <CardContent>
              {loginEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <LogIn className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No login events recorded yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>Browser</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loginEvents.map((event) => (
                      <TableRow key={event.id}>
                        <TableCell className="font-medium">{event.user_email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{event.login_method}</Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{event.ip_address || 'N/A'}</TableCell>
                        <TableCell className="text-sm truncate max-w-[150px]">{event.user_agent || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant={event.status === 'success' ? 'default' : 'destructive'}>
                            {event.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(event.created_at), 'MMM d, HH:mm')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="system" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>System Events</CardTitle>
              <CardDescription>Background jobs, webhooks, and system notifications</CardDescription>
            </CardHeader>
            <CardContent>
              {systemEvents.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No system events recorded yet</p>
                </div>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3">
                    {systemEvents.map((event) => (
                      <div
                        key={event.id}
                        className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                      >
                        <Badge className={getSeverityColor(event.severity)}>
                          {event.severity}
                        </Badge>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">
                              {event.event_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{event.description}</p>
                        </div>
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(event.created_at), 'MMM d, HH:mm')}
                        </span>
                      </div>
                    ))}
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

export default AdminActivity;
