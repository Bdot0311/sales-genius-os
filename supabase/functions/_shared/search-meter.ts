/**
 * One locked update of a search-credit balance.
 *
 * The SQL function holds the subscription row. Callers stop computing
 * "remaining - 1" themselves: two of those writes from the same read both
 * succeed. A gated debit that would pass zero changes nothing and returns
 * applied: false.
 */

export interface MeterClient {
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
}

export interface MeterResult {
  applied: boolean;
  reason?: string;
  credits: number | null;
  daily: number | null;
}

/** Supabase's rpc() is a thenable builder. Call sites cast the client. */
export function asMeterClient(client: { rpc: MeterClient["rpc"] } | object): MeterClient {
  return client as MeterClient;
}

export async function applySearchMeter(
  client: MeterClient,
  input: {
    userId: string;
    creditDelta: number;
    dailyDelta: number;
    description: string;
    gate: boolean;
    dailyCap?: number | null;
  },
): Promise<MeterResult> {
  const { data, error } = await client.rpc("apply_search_meter", {
    p_user_id: input.userId,
    p_credit_delta: input.creditDelta,
    p_daily_delta: input.dailyDelta,
    p_description: input.description,
    p_gate: input.gate,
    p_daily_cap: input.dailyCap ?? null,
  });
  if (error) throw new Error(error.message);
  const row = (data ?? {}) as { applied?: boolean; reason?: string; credits?: number; daily?: number };
  return {
    applied: row.applied === true,
    reason: row.reason,
    credits: typeof row.credits === "number" ? row.credits : null,
    daily: typeof row.daily === "number" ? row.daily : null,
  };
}
