

# SalesOS Feature Upgrade Plan

This is a large, multi-feature build. Following the specified build order, here is the implementation plan for all 6 items.

---

## Build 1: Email Quality Pre-Send Checker (Feature 2)

**New file:** `src/components/outreach/EmailQualityChecker.tsx`

A reusable component that takes `subject` and `body` strings and renders the 5-check quality panel:
- Spam Score (keyword scan with weighted scoring)
- Length Check (word count ranges)
- Readability Score (Flesch-Kincaid approximation: syllable/word/sentence counting)
- CTA Check (question marks + action phrase detection)
- Personalization Depth (count `{{variable}}` and `{variable}` patterns)

Each check renders a row with colored status icon (🟢🟡🔴) and label. Overall score bar at the bottom. Warning banner if overall is red.

**Edits:**
- `BulkSendDialog.tsx` — insert `<EmailQualityChecker>` above the send button (line ~436) when `sendMode === "same"` and subject/body are filled. For `generate` mode, show a note that quality is checked per-email by AI.
- `EmailDetailSheet.tsx` — insert `<EmailQualityChecker>` below the email body section, passing the email's subject and body_text/body_html (stripped of HTML tags).

No database changes needed.

---

## Build 2: Sequence Branch Logic + Templates (Feature 5)

**Edits to existing files (extend only):**

### SequenceStepCard.tsx
- Add a "Branch" toggle button in the card header
- When toggled, render two sub-rows below the card:
  - Path A: "If opened but no reply" with delay + action type selectors
  - Path B: "If never opened" with delay + action type selectors
- Branch data stored as JSON in a new `branch_config` column on `sequence_steps`

### SequencesList.tsx
- Add A/B Test toggle column to each sequence card (stores in `ab_test_enabled` on `email_sequences`)
- When on, show split ratio badge and winning variant indicator
- Replace the "New Sequence" dialog with a modal offering "Start from scratch" or "Use a template"
- 3 pre-built templates (Signal Strike, Executive Thread, The Challenger) — clicking one creates the sequence + pre-populates steps

### SequenceBuilder.tsx
- No structural changes needed; the step cards handle branch display

**Database migration:**
```sql
ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS ab_test_enabled boolean DEFAULT false;
ALTER TABLE email_sequences ADD COLUMN IF NOT EXISTS ab_test_split integer DEFAULT 50;
ALTER TABLE sequence_steps ADD COLUMN IF NOT EXISTS branch_config jsonb DEFAULT null;
```

---

## Build 3: Fix Unrouted MessageBlocks Page

**Edits:**
- `App.tsx` — add lazy import for MessageBlocks and route `<Route path="/dashboard/message-blocks" element={<MessageBlocks />} />`
- `DashboardLayout.tsx` — add "Message Blocks" nav item with `FileText` icon, positioned after the Automations entry (under Sequences context in the nav)

---

## Build 4: ICP Builder (Feature 1)

**New files:**
- `src/pages/ICP.tsx` — page wrapper with DashboardLayout
- `src/components/icp/ICPList.tsx` — 2-column grid of ICP profile cards with "+ New ICP" button
- `src/components/icp/ICPEditor.tsx` — full-screen Sheet (slide-over) with all form fields: name, industries (multi-select), company size (dual range), revenue range, geographies, target titles (tag input), tech stack (tag input), buying signals (checkboxes), pain points (3 inputs), disqualifiers, notes
- `src/components/icp/ICPMatchBadge.tsx` — reusable colored pill showing 0–100 match score with hover tooltip breakdown
- `src/hooks/use-icp-profiles.tsx` — React Query hook for CRUD on `icp_profiles`
- `src/lib/icp-scoring.ts` — pure function that calculates match score (title +25, industry +25, size +25, tech +25)

**Database migration — new table `icp_profiles`:**
```sql
CREATE TABLE public.icp_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  industries jsonb DEFAULT '[]',
  company_size_min integer DEFAULT 1,
  company_size_max integer DEFAULT 10000,
  revenue_range text,
  geographies jsonb DEFAULT '[]',
  target_titles jsonb DEFAULT '[]',
  tech_stack jsonb DEFAULT '[]',
  buying_signals jsonb DEFAULT '[]',
  pain_points jsonb DEFAULT '[]',
  disqualifiers text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;
-- Standard user-owns-row policies for SELECT, INSERT, UPDATE, DELETE
```

**Edits to existing files:**
- `App.tsx` — add route `/dashboard/icp`
- `DashboardLayout.tsx` — add "ICP" nav item with `Target` icon between Leads and Pipeline
- `LeadDetailSheet.tsx` — add `<ICPMatchBadge>` near the top of the sheet
- `LeadsTableView.tsx` — add "ICP Match" column with colored badge

**Lookalike button:**
- `Pipeline.tsx` — on "Closed Won" deal cards, add "Find More Like This" button that navigates to `/dashboard/leads?icp_from_deal=<dealId>` (pre-fills search with the deal's company data)

---

## Build 5: Unified Reply Inbox (Feature 3)

**New files:**
- `src/pages/Inbox.tsx` — DashboardLayout wrapper
- `src/components/inbox/InboxList.tsx` — left column (320px) with thread list, filter tabs (All, Interested, Meeting, Question, Not Now, Not Interested, OOO), unread bold styling
- `src/components/inbox/InboxThread.tsx` — right column with full thread view, classification badge + override dropdown, AI draft response panel (editable textarea), Send Draft / Dismiss buttons, lead profile quick-view card
- `src/hooks/use-reply-threads.tsx` — React Query hook for `reply_threads` table
- `src/lib/reply-classifier.ts` — keyword-based auto-classification function

**Database migration — new table `reply_threads`:**
```sql
CREATE TABLE public.reply_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  subject text NOT NULL,
  original_email_body text,
  reply_body text,
  sender_email text NOT NULL,
  classification text DEFAULT 'question',
  read boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  replied_at timestamptz
);
ALTER TABLE public.reply_threads ENABLE ROW LEVEL SECURITY;
-- Standard user-owns-row RLS policies
```

**Edits:**
- `App.tsx` — add route `/dashboard/inbox`
- `DashboardLayout.tsx` — add "Inbox" nav item with `Inbox` icon at position 0 (above Overview), with unread count badge queried from `reply_threads` where `read = false`

---

## Build 6: Deliverability Dashboard (Feature 4)

**New files:**
- `src/pages/Deliverability.tsx` — DashboardLayout wrapper
- `src/components/deliverability/ConnectedMailboxes.tsx` — card grid of mailboxes with health score, daily sends, warmup status
- `src/components/deliverability/WarmupTracker.tsx` — per-mailbox progress bar, daily ramp display, toggle, 7-day log table
- `src/components/deliverability/DNSHealthChecker.tsx` — domain input + static checklist (SPF, DKIM, DMARC, Custom Domain) with expandable "How to Fix" accordions
- `src/components/deliverability/SendingRules.tsx` — read-only settings card with best-practice sending rules

**Database migration — new table `mailbox_warmup`:**
```sql
CREATE TABLE public.mailbox_warmup (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  warmup_active boolean DEFAULT false,
  current_week integer DEFAULT 1,
  start_date timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mailbox_warmup ENABLE ROW LEVEL SECURITY;
-- Standard user-owns-row RLS policies
```

**Edits:**
- `App.tsx` — add route `/dashboard/deliverability`
- `DashboardLayout.tsx` — add "Deliverability" nav item with `ShieldCheck` icon below Analytics

---

## Summary of All Route Additions to App.tsx

```
/dashboard/icp → ICP.tsx
/dashboard/inbox → Inbox.tsx  
/dashboard/deliverability → Deliverability.tsx
/dashboard/message-blocks → MessageBlocks.tsx
```

## Summary of All Sidebar Additions (top to bottom order)

```
Inbox (new — position 0)
Overview
Leads
ICP (new)
Pipeline
Outreach
Calendar
Analytics
Deliverability (new)
Coach
Automations
  └ Message Blocks (new — sub-item)
Integrations
Settings
```

## Database Tables Created (3 new)
- `icp_profiles` — ICP builder storage
- `reply_threads` — inbox reply threads
- `mailbox_warmup` — deliverability warmup tracking

## Database Columns Added (2 alterations)
- `email_sequences.ab_test_enabled`, `email_sequences.ab_test_split`
- `sequence_steps.branch_config`

All tables use RLS with `user_id = auth.uid()` policies for SELECT, INSERT, UPDATE, DELETE.

