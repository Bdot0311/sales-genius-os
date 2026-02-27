

# Plan: User-Configurable Daily Email Sending Limit

## Overview
Instead of tier-based limits, let users set their own daily email sending cap in their Outreach settings. This gives users full control over their sending volume for deliverability management.

## Changes

### 1. Database: Add `daily_email_limit` and tracking columns to `subscriptions`
- `daily_email_limit` (integer, default 10) -- user-configured cap
- `daily_emails_sent` (integer, default 0) -- today's counter
- `daily_emails_reset_at` (timestamptz, default now()) -- when counter resets

### 2. Outreach UI: Add a daily limit setting
In the Outreach page (likely in a settings area or near the compose section), add a simple input where users can set their daily email limit (e.g., 10, 50, 100, 500). Show current usage like "3 / 50 sent today".

### 3. Enforce limits in `send-email` and `process-scheduled-emails` edge functions
- Before sending, fetch the user's `daily_email_limit`, `daily_emails_sent`, and `daily_emails_reset_at`
- If `daily_emails_reset_at` is in the past (past midnight UTC), reset counter to 0
- If `daily_emails_sent >= daily_email_limit`, reject with a clear error
- On successful send, increment `daily_emails_sent`

### 4. Frontend enforcement
- Disable the Send button when daily limit is reached
- Show a toast/badge with remaining sends for the day
- Allow users to update their limit from the Outreach page

## Technical Details

### Migration SQL
```sql
ALTER TABLE subscriptions
ADD COLUMN daily_email_limit integer NOT NULL DEFAULT 10,
ADD COLUMN daily_emails_sent integer NOT NULL DEFAULT 0,
ADD COLUMN daily_emails_reset_at timestamptz DEFAULT now();
```

### Edge Function Logic (send-email / process-scheduled-emails)
```
1. Fetch subscription: daily_email_limit, daily_emails_sent, daily_emails_reset_at
2. If daily_emails_reset_at < start of today (UTC), reset daily_emails_sent = 0
3. If daily_emails_sent >= daily_email_limit, return 429 "Daily limit reached"
4. On success, increment daily_emails_sent += 1
```

### Outreach UI Addition
- Small settings card or inline control showing: "Daily limit: [input] | Sent today: X / Y"
- Users type any number they want (minimum 1)
- Saves to `subscriptions.daily_email_limit` via a simple update query

