/**
 * Typed client wrappers for the deliverability edge functions.
 * Keeps invoke() calls and response shapes in one place so UI code stays clean.
 */
import { supabase } from "@/integrations/supabase/client";

export type AuthStatus = "pass" | "fail" | "unknown";

export interface RecommendedRecord {
  type: string;
  host: string;
  value: string;
  note?: string;
}

export interface DomainAuthResult {
  domain: string;
  spf: { status: AuthStatus; includesGoogle: boolean; records: string[] };
  dkim: { status: AuthStatus; selector: string | null };
  dmarc: { status: AuthStatus; records: string[] };
  recommended: RecommendedRecord[];
  checkedAt: string;
}

export type BlacklistStatus = "listed" | "clean" | "unknown";

export interface BlacklistResult {
  domain: string;
  listedCount: number;
  anyUnknown: boolean;
  results: { rbl_name: string; status: BlacklistStatus; listed: boolean; detail: string }[];
  checkedAt: string;
}

export interface TrackingVerifyResult {
  domain: string;
  verified: boolean;
  status: "verified" | "failed";
  expected: string;
  found: string[];
  hint?: string;
}

async function invoke<T>(fn: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) throw new Error(error.message || `${fn} failed`);
  if (data && typeof data === "object" && "error" in data && (data as { error?: string }).error) {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}

/** Validate SPF/DKIM/DMARC for a sending domain; persists to sending_domains. */
export function checkDomainAuth(domain: string) {
  return invoke<DomainAuthResult>("check-domain-auth", { domain });
}

/** Query domain-based blacklists (DBLs); logs to blacklist_checks. */
export function checkBlacklists(domain: string) {
  return invoke<BlacklistResult>("check-blacklists", { domain });
}

/** Verify a tracking domain's CNAME; flips tracking_domains.verified. */
export function verifyTrackingDomain(domain: string) {
  return invoke<TrackingVerifyResult>("verify-tracking-domain", { domain });
}
