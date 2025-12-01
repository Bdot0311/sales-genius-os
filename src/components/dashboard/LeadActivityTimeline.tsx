import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow } from "date-fns";
import { Clock, Mail, TrendingUp, User } from "lucide-react";

interface LeadActivityTimelineProps {
  leadId: string;
}

export const LeadActivityTimeline = ({ leadId }: LeadActivityTimelineProps) => {
  const { data: activities, isLoading } = useQuery({
    queryKey: ["lead-activities", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select("*")
        .eq("lead_id", leadId)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  const { data: lead } = useQuery({
    queryKey: ["lead-timeline", leadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", leadId)
        .single();

      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading timeline...</div>;
  }

  const timelineEvents = [
    ...(activities?.map(activity => ({
      type: activity.type,
      description: activity.subject,
      date: new Date(activity.created_at),
      icon: activity.type === "email" ? Mail : User,
    })) || []),
    {
      type: "added",
      description: "Lead added to system",
      date: new Date(lead?.created_at || ""),
      icon: User,
    },
    ...(lead?.score_changed_at
      ? [{
          type: "score_changed",
          description: `ICP Score updated to ${lead.icp_score}`,
          date: new Date(lead.score_changed_at),
          icon: TrendingUp,
        }]
      : []),
    ...(lead?.last_contacted_at
      ? [{
          type: "contacted",
          description: "Last contacted",
          date: new Date(lead.last_contacted_at),
          icon: Mail,
        }]
      : []),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Activity Timeline</h3>
      <div className="space-y-3">
        {timelineEvents.map((event, index) => {
          const Icon = event.icon;
          return (
            <div key={index} className="flex gap-3 items-start">
              <div className="mt-1 p-2 rounded-full bg-secondary">
                <Icon className="h-3 w-3" />
              </div>
              <div className="flex-1 space-y-1">
                <p className="text-sm">{event.description}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(event.date, { addSuffix: true })}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
