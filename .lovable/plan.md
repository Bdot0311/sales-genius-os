

## Plan: Embed Stripe Checkout Inside SalesOS

Instead of redirecting users to Stripe's hosted checkout page in a new tab, we'll use **Stripe Embedded Checkout** to render the payment form directly within SalesOS on a dedicated `/checkout` page.

### How It Works

1. User clicks "Start 14-day free trial" on a plan card
2. User is routed to `/checkout?plan=growth&interval=monthly` (stays on SalesOS)
3. That page renders Stripe's Embedded Checkout form inline using `@stripe/react-stripe-js`
4. On completion, user is redirected to the existing `/confirmation` page

### Changes

**1. Install `@stripe/stripe-js` and `@stripe/react-stripe-js`**
- These packages provide `loadStripe`, `EmbeddedCheckoutProvider`, and `EmbeddedCheckout` components.

**2. Update `create-checkout` edge function**
- Add `ui_mode: 'embedded'` to the Stripe session creation
- Return `clientSecret` instead of `url` (Stripe returns `client_secret` for embedded mode)
- Add a `return_url` parameter instead of `success_url` (required for embedded mode)

**3. Create `/checkout` page (`src/pages/Checkout.tsx`)**
- Reads `plan` and `interval` from URL search params
- Calls `create-checkout` to get a `clientSecret`
- Renders `EmbeddedCheckoutProvider` + `EmbeddedCheckout` from `@stripe/react-stripe-js`
- Shows SalesOS branding/header around the embedded form
- On completion, Stripe auto-redirects to `/confirmation`

**4. Update `src/components/Pricing.tsx`**
- Change `handleCheckout` to navigate to `/checkout?plan=growth&interval=monthly` instead of opening a new tab
- Remove the `window.open(data.url, '_blank')` logic

**5. Update `src/App.tsx`**
- Add route: `/checkout` → lazy-loaded `Checkout` page

### Technical Notes
- Stripe Embedded Checkout handles all PCI compliance, card collection, and trial setup
- The embedded form is fully Stripe-managed but renders inside our page — users never leave SalesOS
- `loadStripe` is initialized with the publishable key (already available via env)
- The `clientSecret` is fetched server-side and passed to `EmbeddedCheckoutProvider`

