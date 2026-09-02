import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DeliverabilityEvent {
  id: string;
  occurred_at: string;
  event_type: string;
  title: string;
  detail: string | null;
  sending_account_id: string | null;
  domain: string | null;
}

export interface QuarantineLogEntry {
  id: string;
  created_at: string;
  mailbox_email: string;
  action: string;
  reason: string;
  volume_redistributed: number | null;
  automatic: boolean;
}

export function useDeliverabilityEvents(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return useQuery({
    queryKey: ["deliverability-events", days],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<DeliverabilityEvent[]> => {
      const { data } = await supabase
        .from("deliverability_events")
        .select("id, occurred_at, event_type, title, detail, sending_account_id, domain")
        .gte("occurred_at", since)
        .order("occurred_at", { ascending: false })
        .limit(200);
      return (data as DeliverabilityEvent[]) ?? [];
    },
  });
}

export function useQuarantineLog(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  return useQuery({
    queryKey: ["quarantine-log", days],
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<QuarantineLogEntry[]> => {
      const { data } = await supabase
        .from("mailbox_quarantine_log")
        .select("id, created_at, mailbox_email, action, reason, volume_redistributed, automatic")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(100);
      return (data as QuarantineLogEntry[]) ?? [];
    },
  });
}
