import { beforeEach, describe, expect, it, vi } from "vitest";
import { dunningStage } from "../../supabase/functions/_shared/dunning-policy";

vi.mock("https://esm.sh/stripe@18.5.0", () => ({ default: class Stripe {} }));
vi.mock("../../supabase/functions/_shared/managed-email.ts", () => ({ sendManagedEmail: vi.fn() }));
vi.mock("../../supabase/functions/_shared/alerts.ts", () => ({ logSystemAlert: vi.fn() }));
vi.mock("../../supabase/functions/_shared/heycatch.ts", () => ({ trackBusinessEvent: vi.fn() }));
vi.mock("../../supabase/functions/_shared/posthog.ts", () => ({ captureServerEvent: vi.fn() }));

// Keep Deno-only imports out of the browser's TypeScript module graph.
const processorPath = "../../supabase/functions/_shared/process-stripe-event.ts";
const { processStripeEvent } = await import(processorPath);

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
      Object.assign(state, { grace_started_at: null, grace_period_ends_at: null, plan: state.previous_plan ?? state.plan, previous_plan: null });
      return { data: true };
    }
    if (name === "billing_start_grace_period" && !state.grace_started_at) Object.assign(state, { grace_started_at: nextFailure });
    return { data: null };
  });
  const client = { from: vi.fn(query), rpc };
  const stripe = {
    subscriptions: { retrieve: vi.fn(async () => ({ status: 'active', customer: 'cus-1', items: { data: [{ price: { id: "price_1T8tyyFTerosS6hiTsTXkWDa" } }] }, current_period_start: 1790899200, current_period_end: 1793577600 })) },
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
    const applyCall = f.rpc.mock.calls.find((call) => call[0] === "apply_stripe_event_to_subscription");
    expect(applyCall?.[1]._updates.search_credits_delta).toBe(2500);
    expect(applyCall?.[1]._updates.search_credits_remaining).toBeUndefined();
    expect(f.rpc).toHaveBeenCalledWith(
      "apply_stripe_event_to_subscription",
      expect.objectContaining({
        _updates: expect.objectContaining({ search_credits_delta: 2500 }),
      }),
    );
    const applyArgs = f.rpc.mock.calls.find((call) => call[0] === "apply_stripe_event_to_subscription")?.[1] as {
      _updates: Record<string, unknown>;
    };
    expect(applyArgs._updates.search_credits_remaining).toBeUndefined();
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

  it('paid invoices persist the verified Stripe plan and both linkage IDs', async () => {
    const f = fixture();
    await processStripeEvent(f.event as never, f.stripe as never, f.client as never);
    expect(f.rpc).toHaveBeenCalledWith('apply_stripe_event_to_subscription', expect.objectContaining({
      _updates: expect.objectContaining({ plan: 'growth', stripe_customer_id: 'cus-1', stripe_subscription_id: 'sub-1', search_credits_base: 2500, leads_limit: 2500 }),
    }));
  });

  it('a paid invoice for a canceled subscription cannot restore paid access', async () => {
    const f = fixture();
    const subscription = await f.stripe.subscriptions.retrieve();
    f.stripe.subscriptions.retrieve.mockResolvedValue({ ...subscription, status: 'canceled' });
    await processStripeEvent(f.event as never, f.stripe as never, f.client as never);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.state.plan).toBe('free');
  });

  it('an invoice belonging to another Stripe customer cannot activate this account', async () => {
    const f = fixture();
    const subscription = await f.stripe.subscriptions.retrieve();
    f.stripe.subscriptions.retrieve.mockResolvedValue({ ...subscription, customer: 'cus-other' });
    await expect(processStripeEvent(f.event as never, f.stripe as never, f.client as never)).rejects.toThrow('Invoice subscription/customer mismatch');
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('an unknown Stripe price cannot default to Growth', async () => {
    const f = fixture();
    const subscription = await f.stripe.subscriptions.retrieve();
    f.stripe.subscriptions.retrieve.mockResolvedValue({ ...subscription, items: { data: [{ price: { id: 'price_unknown' } }] } });
    await expect(processStripeEvent(f.event as never, f.stripe as never, f.client as never)).rejects.toThrow('Unrecognized Stripe base plan');
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('checkout without a Stripe subscription cannot grant the selected plan', async () => {
    const f = fixture();
    const event = { ...f.event, type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer_email: 'customer@example.test', customer: 'cus-1', subscription: null } } };
    await expect(processStripeEvent(event as never, f.stripe as never, f.client as never)).rejects.toThrow('Checkout has no Stripe subscription');
    expect(f.rpc).not.toHaveBeenCalled();
  });

  it('incomplete Stripe checkout cannot activate a paid tier', async () => {
    const f = fixture();
    const subscription = await f.stripe.subscriptions.retrieve();
    f.stripe.subscriptions.retrieve.mockResolvedValue({ ...subscription, status: 'incomplete' });
    const event = { ...f.event, type: 'checkout.session.completed', data: { object: { mode: 'subscription', customer_email: 'customer@example.test', customer: 'cus-1', subscription: 'sub-1' } } };
    await processStripeEvent(event as never, f.stripe as never, f.client as never);
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.state.plan).toBe('free');
  });

});