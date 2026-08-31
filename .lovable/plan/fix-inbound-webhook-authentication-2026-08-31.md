# Fix inbound webhook authentication

## Changes
- Treat the unique, high-entropy inbound endpoint token as the authentication credential when providers cannot send custom headers.
- Continue accepting the existing secret headers for providers that support them.
- Update the webhook setup UI and examples to explain both secure connection methods.
- Redeploy and test the inbound webhook with a representative GetLeads payload.

## Technical details
- Keep rate limits, endpoint ownership, enabled-event checks, and per-user writes unchanged.
- Do not expose the separate webhook secret in the endpoint listing.
