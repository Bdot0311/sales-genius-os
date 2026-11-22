import { describe, expect, it } from 'vitest';
import { isStripePaidStatus, stripePlanFor } from '../../supabase/functions/_shared/stripe-entitlement';

const prices = {
  pro_month: { plan: 'pro', credits: 5000, isYearly: false },
  agency_month: { plan: 'agency', credits: 15000, isYearly: false },
  agency_year: { plan: 'agency', credits: 180000, isYearly: true },
};
const products = { agency_product: 'agency', pro_product: 'pro' };
describe('Stripe-only paid entitlement', () => {
  it.each(['active', 'trialing'])('accepts a Stripe %s subscription', status => {
    expect(isStripePaidStatus(status)).toBe(true);
  });
  it.each(['incomplete', 'incomplete_expired', 'unpaid', 'canceled', 'paused', 'past_due', ''])('does not activate a paid plan for %s', status => {
    expect(isStripePaidStatus(status)).toBe(false);
  });
  it('does not substitute Pro for an AppSumo or unknown price', () => {
    expect(stripePlanFor([{ price: { id: 'appsumo', product: 'unknown' } }], prices, products)).toBeNull();
    expect(stripePlanFor([], prices, products)).toBeNull();
  });
  it('grants Agency 15,000 monthly credits from its recognized Stripe price', () => {
    expect(stripePlanFor([{ price: { id: 'agency_month', product: 'agency_product' } }], prices, products)).toEqual(prices.agency_month);
  });
  it('selects the yearly allowance for a recognized yearly product', () => {
    expect(stripePlanFor([{ price: { id: 'legacy', product: { id: 'agency_product' }, recurring: { interval: 'year' } } }], prices, products)).toEqual(prices.agency_year);
  });
  it('finds the base plan after an unrelated add-on', () => {
    expect(stripePlanFor([{ price: { id: 'addon', product: 'addon' } }, { price: { id: 'pro_month', product: 'pro_product' } }], prices, products)).toEqual(prices.pro_month);
  });
});