

# SalesOS Email Sequences & Behavioral Automation - Complete Implementation Plan

## Overview
This plan adds a complete email sequence system with behavioral state tracking, AI reply analysis, and intelligent automation - matching the features described in the Reddit marketing posts. All features are gated by subscription tier following the existing plan philosophy.

---

## Feature Gating by Subscription Tier

| Feature | Growth ($149) | Pro ($299) | Elite ($799) |
|---------|---------------|------------|--------------|
| **Active Sequences** | 3 | 15 | Unlimited |
| **Steps per Sequence** | 3 | 7 | Unlimited |
| **Sequence Types** | Basic (time-delay only) | State-based + behavioral | Custom triggers + webhooks |
| **Reply Analysis** | None (manual review) | AI scoring (high/low intent) | Full AI + custom signals |
| **Handoff Alerts** | None | Email notifications | Email + Slack/webhook + auto-pause |
| **Relevance Filter** | None | Basic (role/title matching) | Advanced + custom rules |
| **Message Blocks** | 5 | 25 | Unlimited + team sharing |
| **State Tracking** | Basic (sent/replied) | Full behavioral states | Full + custom states |
| **A/B Testing** | None | 2 variants | Unlimited variants |
| **Sequence Analytics** | Basic (open/reply %) | Full funnel + step performance | Custom reports + exports |

---

## Implementation Phases

### Phase 1: Database Schema Foundation

**New Tables:**

1. **email_sequences** - Stores sequence definitions
   - id, user_id, name, description, status (draft/active/paused)
   - created_at, updated_at

2. **sequence_steps** - Individual steps within sequences
   - id, sequence_id, step_number, delay_days, delay_hours
   - subject_template, body_template, step_type
   - trigger_condition (on_enroll, on_open, on_click, on_no_response, on_silence)

3. **sequence_enrollments** - Tracks leads in sequences
   - id, sequence_id, lead_id, user_id, current_step
   - engagement_state, status (active/paused/completed/exited)
   - paused_reason, next_action_at, enrolled_at, completed_at

4. **reply_analysis** - AI analysis of replies
   - id, sent_email_id, lead_id, user_id
   - reply_content, intent_score (1-100)
   - intent_classification (high_intent/low_intent/neutral)
   - detected_signals (JSON: question, timing, objection, positive)
   - requires_human_action, analyzed_at

5. **message_blocks** - Reusable content components
   - id, user_id, name, category (opener/pain_point/social_proof/cta/closing)
   - content, is_shared, created_at

**Schema Changes to Existing Tables:**
- `leads`: Add `engagement_state` column
- `sent_emails`: Add `sequence_id`, `sequence_step`, `enrollment_id` columns

---

### Phase 2: Plan Features Configuration

Update `src/lib/plan-features.ts` with new sequence-related properties:

**Growth tier additions:**
- activeSequences: 3
- stepsPerSequence: 3
- sequenceType: 'basic' (time-delay only)
- replyAnalysis: false
- handoffAlerts: 'none'
- relevanceFilter: false
- messageBlocks: 5
- engagementStates: 'basic'
- sequenceABTesting: 0

**Pro tier additions:**
- activeSequences: 15
- stepsPerSequence: 7
- sequenceType: 'behavioral' (state-based branching)
- replyAnalysis: true
- handoffAlerts: 'email'
- relevanceFilter: 'basic'
- messageBlocks: 25
- engagementStates: 'full'
- sequenceABTesting: 2

**Elite tier additions:**
- activeSequences: -1 (unlimited)
- stepsPerSequence: -1 (unlimited)
- sequenceType: 'custom' (custom triggers + webhooks)
- replyAnalysis: true + customSignals: true
- handoffAlerts: 'webhook' (includes Slack)
- relevanceFilter: 'advanced'
- messageBlocks: -1 (unlimited) + teamSharing: true
- engagementStates: 'custom'
- sequenceABTesting: -1 (unlimited)

**New Upgrade Messages:**
- stateBasedSequences, replyAnalysis, handoffAlerts, relevanceFilter
- webhookHandoffs, customReplySignals, advancedRelevanceFilter

---

### Phase 3: Lead Engagement State Machine

**Engagement States:**
```text
NEW → CONTACTED → (OPENED_NO_CLICK | CLICKED | SILENT) → REPLIED
```

**State Transitions:**
- Email sent → CONTACTED
- Open detected (no click within 1hr) → OPENED_NO_CLICK
- Click detected → CLICKED (high intent)
- No activity for 48hrs → SILENT_AFTER_OPEN or SILENT_AFTER_CLICK
- Reply received → REPLIED (exits automation)

**Implementation:**
- Edge function `update-lead-engagement-state` triggered by email events
- Database trigger on `sent_emails` for automatic state updates
- State changes logged with timestamps

---

### Phase 4: Email Sequences Builder UI

**New Pages:**
1. `/sequences` - List all sequences with status, enrollment count, performance
2. `/sequences/:id/builder` - Visual step editor

**Sequence Builder Features:**
- Drag-and-drop step ordering
- Step configuration: delay, trigger condition, email template
- Preview full sequence flow
- Test mode (send to yourself)

**Step Types (tier-gated):**
- Growth: Initial outreach, time-delayed follow-ups
- Pro: + Behavioral branches (if opened, if clicked, if silent)
- Elite: + Custom triggers, webhook events, CRM field changes

---

### Phase 5: AI Reply Quality Scoring

**Edge Function: `analyze-reply`**
- Uses Lovable AI (no API key required)
- Input: Reply content, lead context, conversation history
- Output: Intent score (1-100), classification, detected signals

**Classification Logic:**
- HIGH INTENT: Questions, objections, timing mentions, tool comparisons
- LOW INTENT: "Thanks", "Interesting", auto-replies, "Not now"
- NEUTRAL: Unclear or mixed signals

**UI Integration:**
- Intent badge on sent emails table
- Dashboard widget: "High-Intent Replies" requiring attention
- Notification when high-intent reply detected

---

### Phase 6: Human Handoff Logic

**Handoff Triggers (Pro+):**
1. Reply contains a question
2. Reply mentions timing ("Q2", "next month", "busy")
3. Click on pricing/demo page
4. Pushback detected ("not interested", "already using X")
5. Intent score > 70

**Implementation:**
- Sequence enrollment pauses automatically
- `paused_reason` stores the trigger type
- Dashboard: "Leads Requiring Action" panel
- One-click actions: Resume, Send Custom Reply, Archive

**Elite additions:**
- Slack notifications
- Webhook to external systems
- Custom trigger rules

---

### Phase 7: Relevance Filter (Pre-Automation Gate)

**Relevance Checks (Pro):**
- Role alignment (job title matches target personas)
- Basic engagement history

**Advanced Checks (Elite):**
- Lead score threshold
- Custom field matching
- Buying intent signals
- Pain confirmation in notes

**Implementation:**
- Check runs before sequence enrollment
- Low-confidence leads flagged for review
- Option to require manual approval

---

### Phase 8: Message Blocks System

**Block Categories:**
- Opener, Pain Point, Social Proof, CTA, Closing, Objection Handler

**Features:**
- Create/edit blocks library
- "Build Email" mode: assemble from blocks
- AI suggests relevant blocks based on lead context

**Tier Limits:**
- Growth: 5 blocks (personal only)
- Pro: 25 blocks (personal only)
- Elite: Unlimited + team sharing

---

## New Edge Functions

1. `update-lead-engagement-state` - State machine transitions
2. `analyze-reply` - AI reply quality scoring
3. `process-sequence-step` - Execute next sequence step
4. `check-handoff-triggers` - Detect pause conditions
5. `calculate-relevance-score` - Pre-enrollment quality check
6. `send-sequence-email` - Send step email with tracking

---

## New UI Components

1. **Pages:**
   - `/sequences` - Sequence list and management
   - `/sequences/:id/builder` - Visual sequence builder
   - Add "Sequences" to dashboard sidebar

2. **Components:**
   - `SequencesList` - Table of all sequences
   - `SequenceBuilder` - Visual step editor
   - `SequenceStepCard` - Individual step configuration
   - `LeadEngagementBadge` - Show current lead state
   - `ReplyIntentBadge` - Show reply quality score
   - `HandoffActionPanel` - Quick actions for paused leads
   - `MessageBlockEditor` - Create/edit content blocks
   - `EmailBlockBuilder` - Assemble emails from blocks

---

## Implementation Order

| Phase | Description | Priority |
|-------|-------------|----------|
| 1 | Database Schema | Required first |
| 2 | Plan Features Config | Required for gating |
| 3 | Engagement State Machine | Core functionality |
| 4 | Sequences Builder UI | User-facing feature |
| 5 | AI Reply Scoring | Pro+ feature |
| 6 | Human Handoff Logic | Pro+ feature |
| 7 | Relevance Filter | Pro+ feature |
| 8 | Message Blocks | All tiers |

---

## Success Metrics

Once implemented, SalesOS will genuinely support:
- State-based outreach (not linear sequences)
- Behavior-driven automation paths
- AI-powered reply quality scoring
- Human-in-the-loop handoffs at key moments
- Pre-automation relevance filtering
- SDR autonomy with message blocks

This aligns the product with all claims made in the Reddit marketing posts.

