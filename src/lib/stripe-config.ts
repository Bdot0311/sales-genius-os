// Stripe Price ID Configuration
export const STRIPE_PRICE_IDS = {
  // Base subscription plans
  starter: 'price_1T8THgFTerosS6hiyasgavsP',
  growth: 'price_1T8THhFTerosS6hicTGH2TUP',
  pro: 'price_1T8THiFTerosS6hi9Vf6Ydsh',
  // Verified prospect add-ons (monthly recurring)
  addon200: 'price_1T8THkFTerosS6hinP7QhH4f',
  addon500: 'price_1T8THlFTerosS6hiAGh5Xdh0',
} as const;

export const STRIPE_PRODUCT_IDS = {
  starter: 'prod_U6gflsh1Zzoh3V',
  growth: 'prod_U6gfTND3QdfgcC',
  pro: 'prod_U6gfOj1Xgfd1vy',
  addon200: 'prod_U6gfGxg3alpeLY',
  addon500: 'prod_U6gfxI0gDG2bSk',
} as const;

export type PlanType = 'free' | 'starter' | 'growth' | 'pro';
export type AddonType = 'addon200' | 'addon500';

// Plan configuration with verified prospect limits
export const PLAN_CONFIG = {
  free: {
    name: 'Free',
    price: 0,
    monthlyProspects: 0,
    yearlyProspects: 0,
    dailyLimit: 0,
    emailRevealCost: 1,
    phoneRevealCost: 10,
    companyRevealCost: 1,
    exportTier: 'none' as const,
  },
  starter: {
    name: 'Starter',
    price: 39,
    monthlyProspects: 400,
    yearlyProspects: 4800,
    dailyLimit: 50,
    emailRevealCost: 1,
    phoneRevealCost: 10,
    companyRevealCost: 1,
    exportTier: 'standard' as const,
  },
  growth: {
    name: 'Growth',
    price: 89,
    monthlyProspects: 1200,
    yearlyProspects: 14400,
    dailyLimit: 150,
    emailRevealCost: 1,
    phoneRevealCost: 10,
    companyRevealCost: 1,
    exportTier: 'advanced' as const,
  },
  pro: {
    name: 'Pro',
    price: 179,
    monthlyProspects: 3000,
    yearlyProspects: 36000,
    dailyLimit: 400,
    emailRevealCost: 1,
    phoneRevealCost: 10,
    companyRevealCost: 1,
    exportTier: 'unlimited' as const,
  },
} as const;

export const ADDON_CONFIG = {
  addon200: {
    prospects: 500,
    price: 49,
  },
  addon500: {
    prospects: 1500,
    price: 119,
  },
} as const;
