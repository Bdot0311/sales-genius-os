import { beforeEach, describe, expect, it, vi } from "vitest";
import { dunningStage } from "../../supabase/functions/_shared/dunning-policy";

vi.mock("https://esm.sh/stripe@18.5.0", () => ({ default: class Stripe {} }));
vi.mock("../../supabase/functions/_shared/managed-email.ts", () => ({ sendManagedEmail: vi.fn() }));
vi.mock("../../supabase/functions/_shared/alerts.ts", () => ({ logSystemAlert: vi.fn() }));
vi.mock("../../supabase/functions/_shared/heycatch.ts", () => ({ trackBusinessEvent: vi.fn() }));
vi.mock("../../supabase/functions/_shared/posthog.ts", () => ({ captureServerEvent: vi.fn() }));

import { processStripeEvent } from "../../supabase/functions/_shared/process-stripe-event";

const firstFailure = "2026-10-01T00:00:00Z";
const paidAt = "2026-10-02T12:00:00Z";
const nextFailure = "2026-11-01T00:00:00Z";

function fixture(options: { apply?: boolean; resumeError?: boolean } = {}) {
  const state = {
    account_status: "past_due", status: "inactive", plan: "free", previous_plan: "growth",
    auto_paused_at: null, grace_started_at: firstFailure, grace_period_ends_at: null,
    failed_invoice_count: 2, search_credits_remaining: 0, last_stripe_event_id: null,
  };
  const query = (table: string) => {
    const q = {
      select: vi.fn(() => q), eq: vi.fn(() => q), ilike: vi.fn(() => q),
      maybeSingle: vi.fn(async () => ({ data: table === "profiles" ? { id: "user-1" } : table === "admin_settings" ? null : { ...state } })),
      single: vi.fn(async () => ({ data: { ...state } })),
    };
    return q;
  };
  const rpc = vi.fn(async (name: string, args: Record<string, any>) => {
    if (name === "apply_stripe_event_to_subscription") {
      if (options.apply === false) return { data: [{ applied: false, reason: "stale_event" }] };
      Object.assign(state, args._updates);
      return { data: [{ applied: true, reason: "applied" }] };
    }
    if (name === "billing_reset_failed_invoice_count") state.failed_invoice_count = 0;
    if (name === "billing_record_auto_resume") {
      if (options.resumeError) return { error: { message: "Temporary failure" } };
      Object.assign(state, { grace_started_at: null, grace_period_ends_at: null, plan: state.previous_plan, previous_plan: null });
      return { data: true };
    }
    if (name === "billing_start_grace_period" && !state.grace_started_at) Object.assign(state, { grace_started_at: nextFailure });
    return { data: null };
  });
  const client = { from: vi.fn(query), rpc };
  const stripe = {
    subscriptions: { retrieve: vi.fn(async () => ({ items: { data: [{ price: { id: "price_1T8tyyFTerosS6hiTsTXkWDa" } }] }, current_period_start: 1790899200, current_period_end: 1793577600 })) },
    customers: { retrieve: vi.fn(async () => ({ email: "customer@example.test" })) },
  };
  const event = { id: "evt-paid", created: Date.parse(paidAt) / 1000, type: "invoice.paid", data: { object: { subscription: "sub-1", customer: "cus-1" } } };
  return { state, client, stripe, event, rpc };
}

describe("payment recovery after the grace day", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears the expired episode and restores the paid plan even after status and count were reset", async () => {
    const f = fixture();
    await processStripeEvent(f.event as never, f.stripe as never, f.client as never);
    expect(f.state.grace_started_at).toBeNull();
    expect(f.state.plan).toBe("growth");
    expect(f.rpc).toHaveBeenCalledWith("billing_record_auto_resume", expect.objectContaining({ _user_id: "user-1" }));
    await f.rpc("billing_start_grace_period", {});
    expect(dunningStage(f.state.grace_started_at, 1, new Date(nextFailure))).toBe("grace");
  });

  it("does not clear a newer failure episode when a stale paid event is rejected", async () => {
    const f = fixture({ apply: false });
    await processStripeEvent(f.event as never, f.stripe as never, f.client as never);
    expect(f.state.grace_started_at).toBe(firstFailure);
    expect(f.rpc).not.toHaveBeenCalledWith("billing_record_auto_resume", expect.anything());
    expect(f.state.failed_invoice_count).toBe(2);
  });

  it("retries the webhook if recovery cannot clear the old episode", async () => {
    const f = fixture({ resumeError: true });
    await expect(processStripeEvent(f.event as never, f.stripe as never, f.client as never)).rejects.toThrow("billing_record_auto_resume failed");
    expect(f.state.grace_started_at).toBe(firstFailure);
  });
});