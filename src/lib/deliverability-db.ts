/**
 * Typed data-access layer for the deliverability tables.
 *
 * The generated Supabase `types.ts` doesn't yet include the Phase 1–3 tables
 * (it's regenerated server-side), so we isolate the single untyped boundary
 * here and expose fully-typed row interfaces + query helpers to the rest of the
 * app. Every field mirrors the migrations exactly.
 */
import { supabase } from "@/integrations/supabase/client";
import type { RecommendedRecord } from "@/lib/deliverability-api";

// Untyped boundary — confined to this module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type AccountStatus = "active" | "paused" | "disabled";
export type AuthStatus = "pass" | "fail" | "unknown";

export interface SendingAccount {
  id: string;
  user_id: string;
  integration_id: string | null;
  email: string;
  provider: string | null;
  daily_limit: number;
  sent_today: number;
  sent_today_date: string;
  min_send_delay_seconds: number;
  max_send_delay_seconds: number;
  warmup_enabled: boolean;
  reputation_score: number | null;
  status: AccountStatus;
  paused_reason: string | null;
  auto_pause_threshold: number;
  last_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SendingDomain {
  id: string;
  user_id: string;
  domain: string;
  spf_status: AuthStatus;
  dkim_status: AuthStatus;
  dmarc_status: AuthStatus;
  dkim_selector: string | null;
  recommended_records: RecommendedRecord[];
  last_checked_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliverabilityAlert {
  id: string;
  user_id: string;
  sending_account_id: string | null;
  domain: string | null;
  alert_type: "reputation_drop" | "blacklist" | "auth_failure" | "bounce_spike" | "complaint_spike" | "warmup_paused";
  severity: "info" | "warning" | "critical";
  message: string;
  status: "active" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

export interface ReputationSnapshot {
  id: string;
  user_id: string;
  sending_account_id: string;
  snapshot_date: string;
  reputation_score: number | null;
  volume: number;
  bounce_rate: number;
  complaint_rate: number;
  open_rate: number;
  created_at: string;
}

// ---- Sending accounts ----
export async function fetchSendingAccounts(): Promise<SendingAccount[]> {
  const { data, error } = await sb
    .from("sending_accounts")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SendingAccount[];
}

export async function updateSendingAccount(
  id: string,
  patch: Partial<Pick<
    SendingAccount,
    "status" | "auto_pause_threshold" | "daily_limit" | "paused_reason" | "warmup_enabled" | "min_send_delay_seconds" | "max_send_delay_seconds"
  >>,
): Promise<void> {
  const { error } = await sb.from("sending_accounts").update(patch).eq("id", id);
  if (error) throw error;
}

// ---- Domains ----
export async function fetchSendingDomains(): Promise<SendingDomain[]> {
  const { data, error } = await sb
    .from("sending_domains")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SendingDomain[];
}

export async function upsertSendingDomain(userId: string, domain: string): Promise<void> {
  const { error } = await sb
    .from("sending_domains")
    .upsert({ user_id: userId, domain }, { onConflict: "user_id,domain" });
  if (error) throw error;
}

export async function deleteSendingDomain(id: string): Promise<void> {
  const { error } = await sb.from("sending_domains").delete().eq("id", id);
  if (error) throw error;
}

// ---- Alerts ----
export async function fetchActiveAlerts(): Promise<DeliverabilityAlert[]> {
  const { data, error } = await sb
    .from("deliverability_alerts")
    .select("*")
    .eq("status", "active")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as DeliverabilityAlert[];
}

export async function resolveAlert(id: string): Promise<void> {
  const { error } = await sb
    .from("deliverability_alerts")
    .update({ status: "resolved", resolved_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

// ---- Reputation snapshots (trend) ----
export async function fetchRecentSnapshots(days = 30): Promise<ReputationSnapshot[]> {
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("reputation_snapshots")
    .select("*")
    .gte("snapshot_date", since)
    .order("snapshot_date", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ReputationSnapshot[];
}
