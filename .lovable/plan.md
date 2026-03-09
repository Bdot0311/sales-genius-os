

## Plan: Add Monthly/Yearly Toggle with Stripe Payment Links

### What's Changing
The "per year" line on paid plan cards becomes a real yearly billing option with a monthly/yearly toggle, ~20% discount, and actual Stripe payment links.

### Yearly Pricing (20% off)
| Plan | Monthly | Yearly (per month) | Yearly total |
|------|---------|-------------------|-------------|
| Starter | $39/mo | $31/mo | $372/yr |
| Growth | $89/mo | $71/mo | $852/yr |
| Pro | $179/mo | $143/mo | $1,716/yr |

### Steps

**1. Create Stripe Products & Prices**
- Create 3 new yearly prices on existing products using the Stripe tools:
  - Starter yearly: $372/year (`interval: "year"`)
  - Growth yearly: $852/year (`interval: "year"`)
  - Pro yearly: $1,716/year (`interval: "year"`)
- Also need to fix monthly prices — current Stripe prices don't match UI ($49/$149/$399 in Stripe vs $39/$89/$179 in UI). Will create new correct monthly prices ($39/$89/$179) on the same products.
- Create Stripe payment links for all 6 prices (3 monthly + 3 yearly)

**2. Update `src/lib/stripe-config.ts`**
- Add yearly price IDs and payment links
- Add yearly pricing amounts to `PLAN_CONFIG`

**3. Update `src/components/Pricing.tsx`**
- Add a Monthly/Yearly toggle at the top of the pricing cards section
- When "Yearly" is selected: show yearly per-month price (e.g., "$31/mo"), a "billed annually" note, and the yearly payment link
- When "Monthly" is selected: show current monthly price and monthly payment link
- Add a "Save 20%" badge next to the yearly toggle option
- Keep the Free plan card completely unchanged
- Update the `secondaryValue` line to show the billing context (e.g., "$372 billed annually") instead of static text

**4. Update `src/pages/PricingPage.tsx`**
- Sync FAQs to mention yearly billing option

### Technical Details
- Toggle state managed with `useState<'monthly' | 'yearly'>('monthly')`
- Each plan object gets `yearlyPrice`, `yearlyPaymentLink`, and `monthlyPaymentLink` fields
- The toggle UI: pill-style switcher with "Monthly" / "Yearly" options + "Save 20%" badge
- Payment links open in new tab (existing behavior preserved)

