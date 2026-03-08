// Stripe Price ID Configuration
export const STRIPE_PRICE_IDS = {
  // Base subscription plans (new Lusha-aligned pricing)
  growth: 'price_1T8THgFTerosS6hiyasgavsP',
  pro: 'price_1T8THhFTerosS6hicTGH2TUP',
  elite: 'price_1T8THiFTerosS6hi9Vf6Ydsh',
  // Search credit add-ons (monthly recurring)
  addon200: 'price_1T8THkFTerosS6hinP7QhH4f',
  addon500: 'price_1T8THlFTerosS6hiAGh5Xdh0',
} as const;

export const STRIPE_PRODUCT_IDS = {
  growth: 'prod_U6gflsh1Zzoh3V',
  pro: 'prod_U6gfTND3QdfgcC',
  elite: 'prod_U6gfOj1Xgfd1vy',
  addon200: 'prod_U6gfGxg3alpeLY',
  addon500: 'prod_U6gfxI0gDG2bSk',
} as const;

export type PlanType = 'free' | 'growth' | 'pro' | 'elite';
export type AddonType = 'addon200' | 'addon500';

// Plan configuration with Lusha-aligned credit consumption model
// Credits consumed per reveal: 1 credit = email, 5 credits = phone, 1 credit = company (API)
// Searches are always free
export const PLAN_CONFIG = {
  free: {
    name: 'Free',
    price: 0,
    monthlyCredits: 0,
    dailySearchLimit: 0,
    emailRevealCost: 1,
    phoneRevealCost: 5,
    companyRevealCost: 1,
    exportTier: 'none' as const,
  },
  growth: {
    name: 'Growth',
    price: 49,
    monthlyCredits: 150,
    dailySearchLimit: 50,
    emailRevealCost: 1,
    phoneRevealCost: 5,
    companyRevealCost: 1,
    exportTier: 'standard' as const,
  },
  pro: {
    name: 'Pro',
    price: 149,
    monthlyCredits: 500,
    dailySearchLimit: 200,
    emailRevealCost: 1,
    phoneRevealCost: 5,
    companyRevealCost: 1,
    exportTier: 'advanced' as const,
  },
  elite: {
    name: 'Elite',
    price: 399,
    monthlyCredits: 1500,
    dailySearchLimit: 1000,
    emailRevealCost: 1,
    phoneRevealCost: 5,
    companyRevealCost: 1,
    exportTier: 'unlimited' as const,
  },
} as const;

export const ADDON_CONFIG = {
  addon200: {
    credits: 200,
    price: 79,
  },
  addon500: {
    credits: 500,
    price: 179,
  },
} as const;
