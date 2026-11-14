/**
 * The one place OutReign talks to Treg.
 *
 * Every call is tagged with the customer server-side (never by a prompt),
 * capped per call, and logged with Treg's call id and settled cost so usage
 * can be reconciled against Treg's ledger and charged to plan credits.
 */
const GATEWAY_URL = "https://connector-gateway.lovable.dev/udc_treg";

/** Cost ceiling for one call, in USD. Also the credit reservation basis. */
export const TREG_MAX_COST_USD = 0.5;
/** What one plan credit is worth against Treg cost (≈ plan price per credit). */
export const TREG_USD_PER_CREDIT = 0.04;

/** Credits reserved before a call: enough to cover the ceiling. */
export const tregReserveCredits = () => Math.ceil(TREG_MAX_COST_USD / TREG_USD_PER_CREDIT);

/** Credits a settled cost is worth; any paid call costs at least one. */
export function tregCreditsForCost(costMicro: number): number {
  if (!Number.isFinite(costMicro) || costMicro <= 0) return 0;
  return Math.max(1, Math.ceil(costMicro / 1_000_000 / TREG_USD_PER_CREDIT));
}

/** Tag values Treg accepts: letters, digits and . _ - : only, ≤128 chars. */
export function tregTag(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]/g, "").slice(0, 128);
}

export function tregConfigured(): boolean {
  return Boolean(Deno.env.get("LOVABLE_API_KEY") && Deno.env.get("UDC_TREG_API_KEY"));
}

export interface TregResult {
  ok: boolean;
  status: number;
  costMicro: number;
  callId: string | null;
  /** Treg's own refusal (balance, caps) — never shown to the customer. */
  tregError: boolean;
  body: unknown;
}

interface UsageClient {
  from(table: string): { insert(row: Record<string, unknown>): PromiseLike<{ error: { message: string } | null }> };
}

export async function tregCall(
  db: UsageClient,
  endpoint: string,
  body: Record<string, unknown>,
  ctx: { userId: string; feature: string },
): Promise<TregResult> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const tregKey = Deno.env.get("UDC_TREG_API_KEY");
  if (!lovableKey || !tregKey) throw new Error("Treg is not configured");

  const res = await fetch(`${GATEWAY_URL}/call/${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": tregKey,
      "Content-Type": "application/json",
      "X-Treg-Meta": `customer=${tregTag(ctx.userId)}, feature=${tregTag(ctx.feature)}`,
      "X-Treg-Route-Max-Cost": String(TREG_MAX_COST_USD),
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  });

  const costMicro = Number(res.headers.get("X-Treg-Cost-Micro") ?? 0) || 0;
  const callId = res.headers.get("X-Treg-Call-Id");
  const text = await res.text();
  let parsed: unknown = null;
  try { parsed = JSON.parse(text); } catch { parsed = null; }

  const { error } = await db.from("treg_usage").insert({
    user_id: ctx.userId,
    feature: ctx.feature,
    endpoint,
    treg_call_id: callId,
    cost_micro: costMicro,
    status: res.status,
  });
  if (error) console.error("[treg] usage row not saved:", error.message);
  if (!res.ok) console.error(`[treg] ${endpoint} failed [${res.status}]`);

  return {
    ok: res.ok,
    status: res.status,
    costMicro,
    callId,
    tregError: res.headers.get("X-Treg-Error") === "1",
    body: parsed,
  };
}

/** People rows from a routed people.search answer ({output: {people}}). */
export function tregPeople(body: unknown): Record<string, unknown>[] {
  const out = (body as { output?: { people?: unknown } } | null)?.output?.people;
  return Array.isArray(out) ? (out as Record<string, unknown>[]) : [];
}
