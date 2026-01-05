// Stripe Price ID Configuration
export const STRIPE_PRICE_IDS = {
  // Base subscription plans
  growth: 'price_1SS44wFTerosS6hiCkKQnnoD',
  pro: 'price_1SS456FTerosS6hisBSDPwo4',
  elite: 'price_1SS45HFTerosS6hiQtxsNVL4',
  // Search credit add-ons (monthly recurring)
  addon500: 'price_1SkurgFTerosS6hiDIBX0NhA',
  addon1500: 'price_1SkurlFTerosS6hirju1trQ4',
} as const;

export const STRIPE_PRODUCT_IDS = {
  growth: 'prod_TOropirqoOz7Ed',
  pro: 'prod_TOrozUbuuN18RP',
  elite: 'prod_TOrod7SaIV2D7s',
  addon500: 'prod_TiLYPvYYIpq6I9',
  addon1500: 'prod_TiLYxYZjV6ru4w',
} as const;

export type PlanType = 'growth' | 'pro' | 'elite';
export type AddonType = 'addon500' | 'addon1500';

// Plan configuration with search credits and limits
export const PLAN_CONFIG = {
  growth: {
    name: 'Growth',
    price: 149,
    monthlySearchCredits: 350,
    dailySearchLimit: 25,
    exportTier: 'standard' as const,
  },
  pro: {
    name: 'Pro',
    price: 299,
    monthlySearchCredits: 700,
    dailySearchLimit: 100,
    exportTier: 'advanced' as const,
  },
  elite: {
    name: 'Elite',
    price: 799,
    monthlySearchCredits: 2000,
    dailySearchLimit: 500,
    exportTier: 'unlimited' as const,
  },
} as const;

export const ADDON_CONFIG = {
  addon500: {
    credits: 500,
    price: 199,
  },
  addon1500: {
    credits: 1500,
    price: 499,
  },
} as const;
