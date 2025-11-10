// Stripe Price ID Configuration
// TODO: Replace these with your actual Stripe price IDs from your Stripe Dashboard
// Create products and prices at: https://dashboard.stripe.com/products

export const STRIPE_PRICE_IDS = {
  growth: 'price_REPLACE_WITH_GROWTH_PRICE_ID',
  pro: 'price_REPLACE_WITH_PRO_PRICE_ID',
  elite: 'price_REPLACE_WITH_ELITE_PRICE_ID',
} as const;

export const STRIPE_PRODUCT_IDS = {
  growth: 'prod_REPLACE_WITH_GROWTH_PRODUCT_ID',
  pro: 'prod_REPLACE_WITH_PRO_PRODUCT_ID',
  elite: 'prod_REPLACE_WITH_ELITE_PRODUCT_ID',
} as const;

export type PlanType = keyof typeof STRIPE_PRICE_IDS;
