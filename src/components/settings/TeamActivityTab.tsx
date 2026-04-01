import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, Activity, User, Users as UsersIcon, TrendingUp, Mail } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ActivityLog {
  id: string;
  user_id: string;
  action_type: string;
  entity_type: string;
  entity_id: string | null;
  details: any;
  created_at: string;
  user_email?: string;
}

export const TeamActivityTab = () => {
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivities();

    // Set up realtime subscription
    const channel = supabase
      .channel('team-activity-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_activity_log'
      }, () => {
        loadActivities();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const loadActivities = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("team_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;

      // Get user emails for each activity
      const userIds = [...new Set(data?.map(a => a.user_id) || [])];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, email")
        .in("id", userIds);

      const emailMap = new Map(profiles?.map(p => [p.id, p.email]) || []);

      const enrichedData = data?.map(activity => ({
        ...activity,
        user_email: emailMap.get(activity.user_id) || "Unknown"
      })) || [];

      setActivities(enrichedData);
    } catch (error) {
      console.error("Error loading activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const getActionIcon = (entityType: string) => {
    switch (entityType) {
      case "leads":
        return <UsersIcon className="h-4 w-4" />;
      case "deals":
        return <TrendingUp className="h-4 w-4" />;
      case "activities":
        return <Mail className="h-4 w-4" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const getActionColor = (actionType: string) => {
    switch (actionType) {
      case "created":
        return "bg-green-500/10 text-green-500";
      case "updated":
        return "bg-blue-500/10 text-blue-500";
      case "deleted":
        return "bg-red-500/10 text-red-500";
      default:
        return "bg-muted";
    }
  };

  const formatActivityDescription = (activity: ActivityLog) => {
    const entityName = activity.entity_type.replace(/_/g, " ");
    const details = activity.details;
    
    let description = `${activity.action_type} ${entityName}`;
    
    if (details) {
      if (details.title) description += `: ${details.title}`;
      else if (details.contact_name) description += `: ${details.contact_name}`;
      else if (details.company_name) description += ` for ${details.company_name}`;
    }

    return description;
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
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Team Activity Log
          </CardTitle>
          <CardDescription>
            Track all team member actions in real-time
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No team activity yet. Activity will appear here as team members work.</p>
            </div>
          ) : (
            <ScrollArea className="h-[600px] pr-4">
              <div className="space-y-3">
                {activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-4 p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className={`p-2 rounded-lg ${getActionColor(activity.action_type)}`}>
                      {getActionIcon(activity.entity_type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {formatActivityDescription(activity)}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <User className="h-3 w-3" />
                              {activity.user_email}
                            </div>
                            <span className="text-xs text-muted-foreground">•</span>
                            <span className="text-xs text-muted-foreground">
                              {new Date(activity.created_at).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <Badge variant="outline" className="capitalize text-xs">
                          {activity.action_type}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
