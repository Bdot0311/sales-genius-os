

# Implement Free Tier + Restructure Pricing (Lusha API-Aligned)

## Summary

Add a zero-cost Free tier and restructure all paid tiers from $149/$299/$799 to $49/$149/$399, aligning credit allocations with Lusha's 25-result billing batches. Update all landing page CTAs to "Start for free — no credit card required."

## Final Pricing Table

| | Free | Growth ($49) | Pro ($149) | Elite ($399) |
|---|---|---|---|---|
| Monthly credits | 0 | 150 | 500 | 1,500 |
| Daily search limit | 0 | 15 | 50 | 150 |
| Results per search | 0 | 25 (1 credit) | 50 (2 credits) | 100 (4 credits) |
| Person enrichment | None | Standard (Location) | Advanced (+Title/Seniority) | Premium (all filters) |
| Company enrichment | None | None | Yes | Yes |
| Lead search | Blocked | Full | Full | Full |
| Active sequences | 0 | 3 | 15 | Unlimited |
| Steps per sequence | 0 | 3 | 7 | Unlimited |
| Message blocks | 0 | 5 | 25 | Unlimited |
| A/B testing | None | None | 2 | Unlimited |
| Pipeline | View only | Full | Full | Full |
| Automations | 0 | 5 | 25 | Unlimited |
| AI Coach | View only | Basic | Advanced | Premium |
| Analytics | Summary | Core | Advanced | Premium |
| Export | None | Standard | Advanced | Unlimited |
| API access | No | No | No | Yes |
| Support | Community | Email | Priority | Dedicated |

Add-ons (paid tiers only): +200 credits ($79), +500 credits ($179)

## Implementation Steps

### Step 1: Database Migration
- Add `'free'` to `subscription_plan` enum
- Update `handle_new_user_subscription()` trigger: default to `'free'`, `search_credits_base = 0`, `search_credits_remaining = 0`, `leads_limit = 0`
- Update `get_user_plan()`: free tier returns all feature flags false, `leads_limit = 0`
- Update `get_user_leads_usage()`: handle free plan
- Update `admin_update_subscription()`: add free plan case, update revenue values to $49/$149/$399
- Update `admin_get_dashboard_stats()`: update revenue calculations to $49/$149/$399

### Step 2: Create New Stripe Products/Prices
- Create Growth at $49/mo, Pro at $149/mo, Elite at $399/mo
- Create add-ons: 200 credits at $79/mo, 500 credits at $179/mo
- Free tier has no Stripe product

### Step 3: Update `src/lib/stripe-config.ts`
- Add `free` tier (price: 0, no price ID, 0 credits, 0 daily limit)
- Update Growth: $49, 150 credits, 15 daily, 25 results/search
- Update Pro: $149, 500 credits, 50 daily, 50 results/search
- Update Elite: $399, 1500 credits, 150 daily, 100 results/search
- Update add-ons: 200/$79, 500/$179

### Step 4: Update `src/lib/plan-features.ts`
- Add `free` tier with all values at 0/false/none (0 sequences, 0 automations, view-only pipeline/coach/analytics, no export, no search)
- Update Growth: price $49, 150 credits, 15 daily, 25 results/search
- Update Pro: price $149, 500 credits, 50 daily, 50 results/search
- Update Elite: price $399, 1500 credits, 150 daily, 100 results/search
- Update `getNextPlan()`: free → growth → pro → elite
- Add new upgrade messages for free-tier gates (`leadSearch`, `enrichment`, `pipelineAccess`)

### Step 5: Update Hooks
- **`use-subscription.tsx`**: Add `'free'` to `SubscriptionPlan` type, default fallback to `'free'`, default `searchCreditsBase` to 0
- **`use-search-credits.tsx`**: Handle `'free'` plan with 0 credits, block credit usage for free users
- **`use-plan-features.tsx`**: Add `'free'` to plan order array
- **`use-leads-usage.tsx`**: Handle free plan returning 0 limits

### Step 6: Update `src/components/Pricing.tsx`
- Add Free plan card (leftmost, CTA: "Get started free" → `/auth`, no payment link)
- Update Growth $49, Pro $149, Elite $399 with new credit counts
- Update 4-column comparison table with free column (all dashes/X for search, enrichment, sequences)
- Update add-on prices to 200/$79, 500/$179
- Update FAQ answers for free tier and remove "credit card required" references

### Step 7: Update `src/components/dashboard/FeatureGateModal.tsx`
- Add free-tier-specific messaging: "Start your 14-day free trial of [Plan]" with plan selection
- Differentiate CTA copy for free vs paid users

### Step 8: Update Landing Page CTAs (6 files)
- **`HeroSection.tsx`**: CTA → "Start for free", trust line → "No credit card required · Free forever plan"
- **`FinalCTA.tsx`**: CTA → "Start for free", keep "No credit card required"
- **`SocialProofComparison.tsx`**: CTA → "Start for free"
- **`CTASection.tsx`**: Update trust badges
- **`MidPageCTA.tsx`**: CTA → "Start for free"
- **`PricingTeaser.tsx`**: Update copy to mention free tier

### Step 9: Update `src/pages/PricingPage.tsx`
- Update hero copy to mention free tier
- Update FAQ answers with new pricing info

### Step 10: Update Edge Functions
- **`fetch-external-leads`**: Reject requests from free-tier users (403 with upgrade prompt), enforce results-per-search limits (25/25/50/100)
- **`enrich-lead`**: Reject requests from free-tier users
- **`check-subscription`**: Handle `'free'` plan
- All edge functions must check `search_credits_remaining` before executing API calls

