// Stripe Price ID Configuration
export const STRIPE_PRICE_IDS = {
  growth: 'price_1SS44wFTerosS6hiCkKQnnoD',
  pro: 'price_1SS456FTerosS6hisBSDPwo4',
  elite: 'price_1SS45HFTerosS6hiQtxsNVL4',
} as const;

export const STRIPE_PRODUCT_IDS = {
  growth: 'prod_TOropirqoOz7Ed',
  pro: 'prod_TOrozUbuuN18RP',
  elite: 'prod_TOrod7SaIV2D7s',
} as const;

export type PlanType = keyof typeof STRIPE_PRICE_IDS;
