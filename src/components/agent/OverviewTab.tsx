import { Mail, Calendar, XCircle, X, RefreshCw, AlertTriangle, Brain, CheckCircle2, XCircle as XCircleIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDistanceToNow } from "date-fns";

interface AgentAction {
  id: string;
  action_type: string;
  prospect_email: string | null;
  description: string | null;
  classification: string | null;
  created_at: string;
}

interface AgentConfig {
  enabled: boolean;
}

interface OverviewTabProps {
  actions: AgentAction[];
  loading: boolean;
  config: AgentConfig | null;
  gmailConnected: boolean;
}

const ACTION_ICONS: Record<string, { icon: React.ReactNode; label: string }> = {
  reply_sent: { icon: <Mail className="w-4 h-4 text-blue-400" />, label: "Reply Sent" },
  meeting_booked: { icon: <Calendar className="w-4 h-4 text-green-400" />, label: "Meeting Booked" },
  unsubscribed: { icon: <XCircle className="w-4 h-4 text-red-400" />, label: "Unsubscribed" },
  closed_thread: { icon: <X className="w-4 h-4 text-gray-400" />, label: "Thread Closed" },
  skipped: { icon: <RefreshCw className="w-4 h-4 text-yellow-400" />, label: "Skipped" },
  error: { icon: <AlertTriangle className="w-4 h-4 text-red-500" />, label: "Error" },
  sync: { icon: <RefreshCw className="w-4 h-4 text-purple-400" />, label: "Synced" },
  classify: { icon: <Brain className="w-4 h-4 text-indigo-400" />, label: "Classified" },
};

const CLASSIFICATION_BADGES: Record<string, { label: string; className: string }> = {
  interested: { label: "Interested", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  objection: { label: "Objection", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  meeting_request: { label: "Meeting Request", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  not_interested: { label: "Not Interested", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  unsubscribe: { label: "Unsubscribe", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  out_of_office: { label: "Out of Office", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

export function OverviewTab({ actions, loading, config, gmailConnected }: OverviewTabProps) {
  const isSetup = config !== null;
  const isEnabled = config?.enabled ?? false;
  const showChecklist = !isEnabled;

  return (
    <div className="space-y-6">
      {showChecklist && (
        <Card className="border-border/60 bg-card/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold text-foreground">Setup Checklist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ChecklistItem
              done={gmailConnected}
              label="Gmail connected"
              description="Connect your Gmail account to allow the agent to read and send emails"
            />
            <ChecklistItem
              done={isSetup}
              label="Agent configured"
              description="Set up your agent's name, persona, and response guidelines"
            />
            <ChecklistItem
              done={isEnabled}
              label="Agent enabled"
              description="Toggle the agent on to start automatic prospect follow-ups"
            />
          </CardContent>
        </Card>
      )}

      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-muted animate-pulse flex-shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 bg-muted animate-pulse rounded w-3/4" />
                    <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : actions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Brain className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No activity yet.</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Enable the agent and run it to start tracking actions.
              </p>
            </div>
          ) : (
            <div className="relative">
              <div className="absolute left-4 top-0 bottom-0 w-px bg-border/40" />
              <div className="space-y-4">
                {actions.map((action) => {
                  const actionInfo = ACTION_ICONS[action.action_type] ?? {
                    icon: <RefreshCw className="w-4 h-4 text-muted-foreground" />,
                    label: action.action_type,
                  };
                  const classificationInfo = action.classification
                    ? CLASSIFICATION_BADGES[action.classification]
                    : null;
                  return (
                    <div key={action.id} className="flex items-start gap-3 pl-8 relative">
                      <div className="absolute left-0 w-8 h-8 rounded-full bg-muted/60 border border-border/60 flex items-center justify-center flex-shrink-0">
                        {actionInfo.icon}
                      </div>
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{actionInfo.label}</span>
                          {classificationInfo && (
                            <Badge
                              variant="outline"
                              className={`text-xs px-1.5 py-0 border ${classificationInfo.className}`}
                            >
                              {classificationInfo.label}
                            </Badge>
                          )}
                        </div>
                        {action.prospect_email && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {action.prospect_email}
                          </p>
                        )}
                        {action.description && (
                          <p className="text-xs text-muted-foreground/70 mt-0.5 line-clamp-2">
                            {action.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground/50 mt-1">
                          {formatDistanceToNow(new Date(action.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ChecklistItem({
  done,
  label,
  description,
}: {
  done: boolean;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      {done ? (
        <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
      ) : (
        <XCircleIcon className="w-5 h-5 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
      )}
      <div>
        <p className={`text-sm font-medium ${done ? "text-foreground" : "text-muted-foreground"}`}>
          {label}
        </p>
        <p className="text-xs text-muted-foreground/60 mt-0.5">{description}</p>
      </div>
    </div>
  );
}
