import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mail } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface SentEmailRow {
  id: string;
  to_email: string;
  subject: string;
  sent_at: string | null;
  gmail_thread_id: string | null;
  lead_id: string | null;
  leads: { contact_name: string | null; company_name: string | null } | null;
  reply_analysis: {
    intent_classification: string | null;
    reply_content: string | null;
  } | null;
}

interface ThreadStatusConfig {
  label: string;
  className: string;
}

const THREAD_STATUS_MAP: Record<string, ThreadStatusConfig> = {
  active: { label: "Active", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
  replied: { label: "Replied", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  meeting_booked: { label: "Meeting Booked", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  unsubscribed: { label: "Unsubscribed", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  closed: { label: "Closed", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

const CLASSIFICATION_MAP: Record<string, ThreadStatusConfig> = {
  interested: { label: "Interested", className: "bg-green-500/20 text-green-400 border-green-500/30" },
  objection: { label: "Objection", className: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  meeting_request: { label: "Meeting Request", className: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  not_interested: { label: "Not Interested", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  unsubscribe: { label: "Unsubscribe", className: "bg-red-500/20 text-red-400 border-red-500/30" },
  out_of_office: { label: "Out of Office", className: "bg-gray-500/20 text-gray-400 border-gray-500/30" },
};

function deriveThreadStatus(email: SentEmailRow): string {
  const classification = email.reply_analysis?.intent_classification;
  if (classification === "meeting_request") return "meeting_booked";
  if (classification === "unsubscribe") return "unsubscribed";
  if (classification) return "replied";
  return "active";
}

export function InboxTab() {
  const [threads, setThreads] = useState<SentEmailRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadThreads();
  }, []);

  async function loadThreads() {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { data, error } = await supabase
        .from("sent_emails")
        .select(
          `id, to_email, subject, sent_at, gmail_thread_id, lead_id,
           leads(contact_name, company_name),
           reply_analysis(intent_classification, reply_content)`
        )
        .eq("user_id", user.id)
        .not("gmail_thread_id", "is", null)
        .gte("sent_at", thirtyDaysAgo.toISOString())
        .order("sent_at", { ascending: false })
        .limit(50);

      if (error) throw error;

      const rows = (data ?? []).map((row) => {
        const ra = Array.isArray(row.reply_analysis)
          ? row.reply_analysis[0] ?? null
          : (row.reply_analysis as { intent_classification: string | null; reply_content: string | null } | null);
        return {
          ...row,
          leads: Array.isArray(row.leads)
            ? (row.leads[0] ?? null)
            : (row.leads as { contact_name: string | null; company_name: string | null } | null),
          reply_analysis: ra,
        } as SentEmailRow;
      });

      setThreads(rows);
    } catch (err) {
      console.error("InboxTab load error:", err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Card key={i} className="border-border/60 bg-card/60">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="h-3 bg-muted animate-pulse rounded w-1/3" />
                  <div className="h-5 bg-muted animate-pulse rounded w-20" />
                </div>
                <div className="h-3 bg-muted animate-pulse rounded w-2/3" />
                <div className="h-3 bg-muted animate-pulse rounded w-1/2" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <Mail className="w-12 h-12 text-muted-foreground/30 mb-4" />
        <p className="text-sm font-medium text-muted-foreground">No active threads yet.</p>
        <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
          Send emails to prospects to start tracking conversations here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((thread) => {
        const status = deriveThreadStatus(thread);
        const statusConfig = THREAD_STATUS_MAP[status] ?? THREAD_STATUS_MAP.active;
        const classificationKey = thread.reply_analysis?.intent_classification ?? "";
        const classificationConfig = CLASSIFICATION_MAP[classificationKey] ?? null;
        const replyPreview = thread.reply_analysis?.reply_content
          ? thread.reply_analysis.reply_content.slice(0, 100) +
            (thread.reply_analysis.reply_content.length > 100 ? "…" : "")
          : null;

        return (
          <Card
            key={thread.id}
            className="border-border/60 bg-card/60 hover:bg-card/80 transition-colors"
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {thread.to_email}
                    </span>
                    {thread.leads?.company_name && (
                      <span className="text-xs text-muted-foreground/70">
                        · {thread.leads.company_name}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate mb-2">{thread.subject}</p>
                  {replyPreview && (
                    <p className="text-xs text-muted-foreground/60 italic line-clamp-2 mb-2">
                      "{replyPreview}"
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground/50">
                    {thread.sent_at && (
                      <span>
                        Sent {formatDistanceToNow(new Date(thread.sent_at), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <Badge
                    variant="outline"
                    className={`text-xs px-1.5 py-0 border ${statusConfig.className}`}
                  >
                    {statusConfig.label}
                  </Badge>
                  {classificationConfig && (
                    <Badge
                      variant="outline"
                      className={`text-xs px-1.5 py-0 border ${classificationConfig.className}`}
                    >
                      {classificationConfig.label}
                    </Badge>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
