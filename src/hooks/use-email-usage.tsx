import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmailUsage {
  plan: string;
  monthly_sent: number;
  monthly_limit: number;       // -1 = unlimited
  monthly_remaining: number;   // -1 = unlimited
  monthly_reset_at: string;
  daily_sent: number;
  daily_limit: number;
  daily_remaining: number;
}

export interface SequenceUsage {
  sequence_id: string;
  sequence_name: string;
  sent_this_month: number;
}

export interface SendTrendPoint {
  day: string;
  sent: number;
}

export function useEmailUsage() {
  return useQuery({
    queryKey: ["email-usage"],
    queryFn: async (): Promise<EmailUsage | null> => {
      const { data, error } = await supabase.rpc("get_monthly_email_usage" as any);
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as EmailUsage) || null;
    },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useSequenceUsage() {
  return useQuery({
    queryKey: ["sequence-monthly-usage"],
    queryFn: async (): Promise<SequenceUsage[]> => {
      const { data, error } = await supabase.rpc("get_sequence_monthly_usage" as any);
      if (error) throw error;
      return (data as SequenceUsage[]) || [];
    },
    staleTime: 60_000,
  });
}

export function useEmailSendTrend(days = 30) {
  return useQuery({
    queryKey: ["email-send-trend", days],
    queryFn: async (): Promise<SendTrendPoint[]> => {
      const { data, error } = await supabase.rpc("get_email_send_trend" as any, { _days: days });
      if (error) throw error;
      return (data as SendTrendPoint[]) || [];
    },
    staleTime: 60_000,
  });
}
