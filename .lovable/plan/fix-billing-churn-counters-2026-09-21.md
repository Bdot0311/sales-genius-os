# Fix Billing & Churn counters

## What will change
- Add one admin-only billing summary that counts subscription starts, current payment issues, completed cancellations, scheduled cancellations, and chargebacks from their authoritative records.
- Update the Billing & Churn page to load those totals independently from the open-alert list, so resolving an alert no longer resets a historical counter to zero.
- Refresh the totals after a Stripe reconciliation and during the existing automatic refresh.
- Record the customer-visible reliability fix in What's New.

## Technical details
- Use current subscription fields for live states such as payment trouble and cancellation scheduling.
- Use processed Stripe events and billing audit records for lifecycle totals, with deduplication where needed.
- Restrict the summary to admins through the existing role check.
- Verify the live results against current billing records and check the preview build.
