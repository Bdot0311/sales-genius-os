// Stripe Price ID Configuration
export const STRIPE_PRICE_IDS = {
  // Base subscription plans - Monthly
  starter_monthly: 'price_1T8tywFTerosS6hi0fHQuybr',
  growth_monthly: 'price_1T8tyyFTerosS6hiTsTXkWDa',
  pro_monthly: 'price_1T8tz0FTerosS6hiKJluR3kk',
  // Base subscription plans - Yearly
  starter_yearly: 'price_1T8tyxFTerosS6hiSakB51fA',
  growth_yearly: 'price_1T8tyzFTerosS6hiUyzpHnCK',
  pro_yearly: 'price_1T8tz0FTerosS6hiIHNG82Bh',
  // Legacy price IDs (kept for backwards compatibility)
  starter: 'price_1T8THgFTerosS6hiyasgavsP',
  growth: 'price_1T8THhFTerosS6hicTGH2TUP',
  pro: 'price_1T8THiFTerosS6hi9Vf6Ydsh',
  // Verified prospect add-ons (monthly recurring)
  addon200: 'price_1T8THkFTerosS6hinP7QhH4f',
  addon500: 'price_1T8THlFTerosS6hiAGh5Xdh0',
} as const;

export const STRIPE_PRODUCT_IDS = {
  starter_monthly: 'prod_U78FZoAWovU1rX',
  starter_yearly: 'prod_U78FC92stOkRxS',
  growth_monthly: 'prod_U78Ff02VQAzrLC',
  growth_yearly: 'prod_U78Fk0l7swAukt',
  pro_monthly: 'prod_U78Fs2HpZzcZJc',
  pro_yearly: 'prod_U78Fuo9Mg04kz9',
  // Legacy
  starter: 'prod_U6gflsh1Zzoh3V',
  growth: 'prod_U6gfTND3QdfgcC',
  pro: 'prod_U6gfOj1Xgfd1vy',
  addon200: 'prod_U6gfGxg3alpeLY',
  addon500: 'prod_U6gfxI0gDG2bSk',
} as const;

export type PlanType = 'free' | 'starter' | 'growth' | 'pro';
export type BillingInterval = 'monthly' | 'yearly';
export type AddonType = 'addon200' | 'addon500';

// Plan configuration with verified prospect limits
export const PLAN_CONFIG = {
  free: {
    name: 'Free',
    monthlyPrice: 0,
    yearlyPrice: 0,
    yearlyTotal: 0,
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
    monthlyPrice: 39,
    yearlyPrice: 31,
    yearlyTotal: 372,
    monthlyProspects: 400,
    yearlyProspects: 4800, // Full annual pool upfront (400 x 12)
    dailyLimit: 50,
    emailRevealCost: 1,
    phoneRevealCost: 10,
    companyRevealCost: 1,
    exportTier: 'standard' as const,
  },
  growth: {
    name: 'Growth',
    monthlyPrice: 89,
    yearlyPrice: 71,
    yearlyTotal: 852,
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
    monthlyPrice: 179,
    yearlyPrice: 143,
    yearlyTotal: 1716,
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

// One-time credit top-up packs (Lusha-style)
export const TOPUP_PACKS = [
  {
    priceId: 'price_1T8vsKFTerosS6hitP0ffw6v',
    prospects: 200,
    price: '37.50',
    perTenCredits: '1.88',
    popular: false,
  },
  {
    priceId: 'price_1T8vsLFTerosS6hiVcWr4NqZ',
    prospects: 400,
    price: '67.50',
    perTenCredits: '1.69',
    popular: true,
  },
  {
    priceId: 'price_1T8vsNFTerosS6hiB6LZcLUT',
    prospects: 600,
    price: '90.00',
    perTenCredits: '1.50',
    popular: false,
  },
] as const;

// Yearly price IDs for annual pool detection
export const YEARLY_PRICE_IDS = [
  STRIPE_PRICE_IDS.starter_yearly,
  STRIPE_PRICE_IDS.growth_yearly,
  STRIPE_PRICE_IDS.pro_yearly,
] as const;
