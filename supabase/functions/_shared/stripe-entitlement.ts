// Resolve only Stripe-owned, recognized base plans. Never use a signup choice
// or an unrelated price as a fallback paid entitlement.
export interface StripePlanItem {
  price: { id: string; product?: string | { id: string }; recurring?: { interval: string } | null };
}

export function isStripePaidStatus(status: string): boolean {
  return status === 'active' || status === 'trialing';
}

export function stripePlanFor<T extends { plan: string; isYearly?: boolean }>(
  items: readonly StripePlanItem[], prices: Record<string, T>, products: Record<string, string>,
): T | null {
  for (const { price } of items) {
    if (prices[price.id]) return prices[price.id];
    const productId = typeof price.product === 'string' ? price.product : price.product?.id;
    if (!productId) continue;
    const plan = products[productId];
    if (!plan) continue;
    const yearly = price.recurring?.interval === 'year';
    const details = Object.values(prices).find(value => value.plan === plan && Boolean(value.isYearly) === yearly);
    if (details) return details;
  }
  return null;
}