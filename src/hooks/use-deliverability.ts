import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchSendingAccounts,
  fetchSendingDomains,
  fetchActiveAlerts,
  fetchRecentSnapshots,
  fetchWarmupMessages,
  updateSendingAccount,
  upsertSendingDomain,
  deleteSendingDomain,
  resolveAlert,
  setWarmupEnabled,
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

// Finite retry so a failing query (e.g. tables not migrated yet) settles into an
// error state quickly instead of leaving the page on an endless loading skeleton.
const QUERY_OPTS = { retry: 1, staleTime: 30_000 } as const;

export function useSendingAccounts() {
  return useQuery({ queryKey: ["sending-accounts"], queryFn: fetchSendingAccounts, ...QUERY_OPTS });
}

export function useSendingDomains() {
  return useQuery({ queryKey: ["sending-domains"], queryFn: fetchSendingDomains, ...QUERY_OPTS });
}

export function useActiveAlerts() {
  return useQuery({ queryKey: ["deliverability-alerts"], queryFn: fetchActiveAlerts, ...QUERY_OPTS });
}

export function useReputationSnapshots(days = 30) {
  return useQuery({
    queryKey: ["reputation-snapshots", days],
    queryFn: () => fetchRecentSnapshots(days),
    ...QUERY_OPTS,
  });
}

export function useWarmupMessages(days = 30) {
  return useQuery({
    queryKey: ["warmup-messages", days],
    queryFn: () => fetchWarmupMessages(days),
    ...QUERY_OPTS,
  });
}

export function useToggleWarmup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { account: { id: string; user_id: string; email: string }; enabled: boolean }) =>
      setWarmupEnabled(args.account, args.enabled),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sending-accounts"] });
      qc.invalidateQueries({ queryKey: ["warmup-messages"] });
    },
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
