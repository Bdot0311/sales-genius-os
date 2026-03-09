

# Replace Stack Comparison with Social Proof Comparison

## What Changes

Remove the current "Your Stack Wasn't Built to Win" comparison section and replace it with a conversion-focused "What Changes When You Switch" section. This new section uses aspirational transformation framing instead of negativity -- showing outcomes teams achieve with SalesOS.

## Design

- **Heading:** "What Changes When You Switch"
- **Subheading:** "Teams that consolidate onto SalesOS see measurable improvements across their entire sales operation."
- **Layout:** Two-column grid with "Before" (neutral, muted) and "With SalesOS" (primary accent, elevated) cards
- **Bottom:** Social proof line ("Join 500+ sales teams") with CTA button
- **Animations:** IntersectionObserver scroll-reveal, consistent with existing sections

## Transformation rows

| Before (neutral tone) | With SalesOS (outcome) |
|---|---|
| Hours toggling between tools | 3x faster lead-to-outreach time |
| Manual follow-up tracking | Automated sequences with real-time signals |
| Generic batch emails | AI-personalized outreach, 2-4x higher reply rates |
| Scattered pipeline data | Single dashboard with deal intelligence |
| Guesswork on lead quality | AI scoring with 85%+ fit accuracy |

## Technical Steps

1. **Create** `src/components/landing/SocialProofComparison.tsx` -- new component following existing patterns (container max-w-[1120px], IntersectionObserver, responsive grid)
2. **Update** `src/components/landing/index.ts` -- swap `StackComparisonSection` export for `SocialProofComparison`
3. **Update** `src/pages/Index.tsx` -- import and render `SocialProofComparison` in place of `StackComparisonSection`
4. **Delete** `src/components/landing/StackComparisonSection.tsx`

