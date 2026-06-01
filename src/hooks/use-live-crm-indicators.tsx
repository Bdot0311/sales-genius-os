import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, TrendingUp, Inbox as InboxIcon } from "lucide-react";
import { createElement } from "react";

/**
 * Global firehose: surfaces toasts when leads reply, deal stages change,
 * or new sent-email activity hits the user's account. Mount once inside
 * the authenticated layout. Also logs realtime end-to-end latency.
 */
export function useLiveCrmIndicators() {
  useEffect(() => {
    let cancelled = false;
    let cleanups: Array<() => void> = [];

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const filter = `user_id=eq.${user.id}`;

      const log = (table: string, payload: any) => {
        const commitTs = payload.commit_timestamp;
        const lag = commitTs ? Date.now() - new Date(commitTs).getTime() : null;
        // eslint-disable-next-line no-console
        console.log(`[realtime] ${table} ${payload.eventType}${lag !== null ? ` lag=${lag}ms` : ""}`);
      };

      // Replies inbox
      const replies = supabase
        .channel(`live-replies-${user.id}`)
        .on(
          "postgres_changes" as any,
          { event: "INSERT", schema: "public", table: "reply_threads", filter },
          (payload: any) => {
            log("reply_threads", payload);
            const r = payload.new || {};
            toast.success(`New reply from ${r.sender_email || "lead"}`, {
              description: r.subject || "Open your inbox to view it.",
              icon: createElement(InboxIcon, { className: "h-4 w-4" }),
              action: {
                label: "Open Inbox",
                onClick: () => { window.location.href = "/dashboard/inbox"; },
              },
            });
          }
        )
        .subscribe();
      cleanups.push(() => supabase.removeChannel(replies));

      // Deal stage changes
      const deals = supabase
        .channel(`live-deals-${user.id}`)
        .on(
          "postgres_changes" as any,
          { event: "UPDATE", schema: "public", table: "deals", filter },
          (payload: any) => {
            log("deals", payload);
            const o = payload.old || {};
            const n = payload.new || {};
            if (o.stage && n.stage && o.stage !== n.stage) {
              toast(`${n.title || "Deal"} → ${n.stage}`, {
                description: `Moved from ${o.stage}`,
                icon: createElement(TrendingUp, { className: "h-4 w-4" }),
              });
            }
          }
        )
        .subscribe();
      cleanups.push(() => supabase.removeChannel(deals));

      // Email sent / opened
      const emails = supabase
        .channel(`live-emails-${user.id}`)
        .on(
          "postgres_changes" as any,
          { event: "UPDATE", schema: "public", table: "sent_emails", filter },
          (payload: any) => {
            log("sent_emails", payload);
            const o = payload.old || {};
            const n = payload.new || {};
            if (!o.opened_at && n.opened_at) {
              toast(`Email opened`, {
                description: n.subject || n.to_email,
                icon: createElement(Mail, { className: "h-4 w-4" }),
              });
            } else if (!o.replied_at && n.replied_at) {
              toast.success(`Email replied`, {
                description: n.subject || n.to_email,
                icon: createElement(Mail, { className: "h-4 w-4" }),
              });
            }
          }
        )
        .subscribe();
      cleanups.push(() => supabase.removeChannel(emails));
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, []);
}
