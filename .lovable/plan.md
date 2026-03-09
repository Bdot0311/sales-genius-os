

## Lusha-Style "Quick Buy Credits" One-Time Top-Up

Based on the Lusha screenshot, the implementation is a modal dialog with selectable credit packs (radio-style), per-unit cost breakdown, a "Popular" badge on the middle tier, and a "Confirm payment" CTA. This replaces the current recurring add-on model with one-time purchases.

### Design (matching Lusha reference)

- **Dialog modal** titled "Quick Buy Credits" triggered from Settings > Credits tab and the Pricing page add-on section
- **Two tabs**: "Add to subscription" (with "Up to 50% off" badge) and "One-time top-up" (default/active)
- **Info line**: "Pay once - no commitments, no plan changes."
- **Three selectable pack cards** (radio-select, one active at a time):
  - 200 prospects -- $37.50 ($1.88 / 10 credits)
  - 400 prospects -- $67.50 ($1.69 / 10 credits) -- "Popular" badge, pre-selected
  - 600 prospects -- $90.00 ($1.50 / 10 credits)
- **Footer**: Cancel + "Confirm payment" button, plus "Need more each month? Upgrade your plan" link
- Selected pack gets a primary border highlight

### Technical Steps

**1. Create Stripe one-time products/prices**
Use the Stripe tools to create 3 one-time price objects for the credit packs (200, 400, 600 prospects).

**2. New edge function: `purchase-credit-topup/index.ts`**
- Accepts `priceId` and `prospectCount` in the request body
- Authenticates user via JWT
- Creates a Stripe Checkout session with `mode: "payment"` 
- Returns the checkout URL
- On the success page, verify payment via session ID and add credits to `search_credits_remaining` + log a `search_transactions` entry

**3. New edge function: `verify-topup-payment/index.ts`**
- Called on the confirmation/success page after redirect
- Takes `session_id` from URL params
- Retrieves the Checkout Session from Stripe, confirms payment succeeded
- Adds the purchased prospect count to `search_credits_remaining` in the subscriptions table
- Inserts a `search_transactions` record (type: 'topup')
- Prevents double-crediting by checking if session_id was already processed (store in a `topup_payments` table or check transactions)

**4. Database migration**
- Add `topup_payments` table to track processed one-time payments and prevent double-crediting:
  - `id`, `user_id`, `stripe_session_id` (unique), `prospects_added`, `amount_paid`, `created_at`

**5. New component: `QuickBuyCreditsDialog.tsx`**
- Dialog component matching Lusha's layout
- Radio-select between 3 packs
- Per-unit cost breakdown shown under each pack
- "Popular" badge on the 400-prospect pack
- "Confirm payment" opens Stripe Checkout in new tab
- "Need more each month? Upgrade your plan" link at bottom

**6. Update `CreditsUsageTab.tsx`**
- Add a "Buy credits" button that opens the `QuickBuyCreditsDialog`

**7. Update `Pricing.tsx` add-ons section**
- Replace the current recurring add-on cards with a button/CTA that opens the same `QuickBuyCreditsDialog`
- Update copy from "$49/mo" to one-time pricing

**8. Update `use-search-credits.tsx`**
- Replace `addAddon`/`removeAddon` with a `purchaseTopUp` method
- Add method to verify topup payment on confirmation page

**9. Update yearly billing to grant annual pool upfront**
- In `stripe-webhook/index.ts`: when processing a yearly subscription, set `search_credits_base` and `search_credits_remaining` to the annual total (e.g., 4,800 / 14,400 / 36,000)
- In `check-subscription/index.ts`: detect yearly vs monthly price IDs and apply correct pool size

**10. Update `stripe-config.ts` and `helpArticles.ts`**
- Replace `ADDON_CONFIG` with one-time pack definitions
- Update FAQ/help copy to reflect one-time top-ups instead of recurring add-ons

### Files

| File | Action |
|---|---|
| `src/components/dashboard/QuickBuyCreditsDialog.tsx` | Create |
| `supabase/functions/purchase-credit-topup/index.ts` | Create |
| `supabase/functions/verify-topup-payment/index.ts` | Create |
| `supabase/migrations/` | New migration for `topup_payments` table |
| `src/components/settings/CreditsUsageTab.tsx` | Add "Buy credits" button |
| `src/components/Pricing.tsx` | Replace add-on section |
| `src/hooks/use-search-credits.tsx` | Replace addon methods with topup |
| `src/lib/stripe-config.ts` | Update ADDON_CONFIG for one-time packs |
| `supabase/functions/stripe-webhook/index.ts` | Yearly pool logic |
| `supabase/functions/check-subscription/index.ts` | Yearly pool logic |
| `src/components/help/helpArticles.ts` | Update add-on copy |

