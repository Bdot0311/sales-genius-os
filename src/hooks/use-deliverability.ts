import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSendingAccounts,
  fetchSendingDomains,
  fetchActiveAlerts,
  fetchRecentSnapshots,
  updateSendingAccount,
  upsertSendingDomain,
  deleteSendingDomain,
  resolveAlert,
  type SendingAccount,
} from "@/lib/deliverability-db";

export function useUserId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setId(data.user?.id ?? null);
    });
    return () => { cancelled = true; };
  }, []);
  return id;
}

export function useSendingAccounts() {
  return useQuery({ queryKey: ["sending-accounts"], queryFn: fetchSendingAccounts });
}

export function useSendingDomains() {
  return useQuery({ queryKey: ["sending-domains"], queryFn: fetchSendingDomains });
}

export function useActiveAlerts() {
  return useQuery({ queryKey: ["deliverability-alerts"], queryFn: fetchActiveAlerts });
}

export function useReputationSnapshots(days = 30) {
  return useQuery({
    queryKey: ["reputation-snapshots", days],
    queryFn: () => fetchRecentSnapshots(days),
  });
}

export function useUpdateAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; patch: Parameters<typeof updateSendingAccount>[1] }) =>
      updateSendingAccount(args.id, args.patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sending-accounts"] }),
  });
}

export function useAddDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: string; domain: string }) => upsertSendingDomain(args.userId, args.domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sending-domains"] }),
  });
}

export function useDeleteDomain() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSendingDomain(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sending-domains"] }),
  });
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resolveAlert(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["deliverability-alerts"] }),
  });
}

/** Aggregate health across accounts that have a real score. */
export function aggregateHealth(accounts: SendingAccount[]): { score: number | null; scored: number } {
  const scored = accounts.filter((a) => a.reputation_score !== null);
  if (scored.length === 0) return { score: null, scored: 0 };
  const avg = scored.reduce((s, a) => s + (a.reputation_score ?? 0), 0) / scored.length;
  return { score: Math.round(avg), scored: scored.length };
}
