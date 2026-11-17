# Agent missions

A mission is a goal set once on an agent. It keeps running on a schedule until someone pauses or stops it. The product line "your agents work while you sleep" refers to this path.

It is off until both of these are true:

- The `agentMissions` feature flag is on.
- That workspace has a row in `agent_mission_grants` with `enabled = true`.

Either one off means the Missions screen is hidden and the cron claims nothing. Plan caps are unchanged. Free workspaces can save a mission, but autopilot is forced back to approval because `agentAutoSend` is already false on that plan. Daily lead caps are clamped to the existing `agentDailyLeadSourcing` number for the plan.

## What runs

Every five minutes, `dispatch-agent-missions` calls `enqueue_due_agent_missions()`.

That function takes an advisory lock per mission and calls `claim_agent_mission_run`. One local day is one run (`window_key`). A second caller gets nothing. The claim is granted to `service_role` only. `anon` and `authenticated` cannot execute it, and the function rejects those roles if a grant is added later.

The claim inserts a row in `agent_mission_runs` and moves `next_run_at` to the next allowed local morning. `agent_mission_ensure_job` then inserts one `agent_jobs` row of kind `mission` and one `agent_job_items` row. The existing `process-agent-jobs` drain, already on a one-minute cron, picks that item up.

A pass does one unit of work and releases the item with `release_agent_job_items` so a crash or a timeout continues on the next minute instead of starting a second run. If the process dies after the claim and before the job row, the next tick creates the job for the existing run. It does not claim the window again.

Each pass re-reads the flag, the grant, the subscription plan, and whether the mission is still active before it searches, drafts, or schedules.

## What a pass does

1. Search with the saved ICP (or the agent's stored targeting if no ICP is attached). `strict` stays on. Filters are not relaxed to fill the cap.
2. Save a lead only when the result already has a contact name, a company name, and an email. Missing fields are skipped and named in the report. Nothing is filled in with "Unknown".
3. Research the company through `research-lead` when it does not already have a brief.
4. Draft a first touch through the same `draftForLead` helper the queue already uses. Drafting stays on the Pro model header the worker already sets for `generate-email`. Research and search keep their own tiers.
5. Approval mode stops at the draft. Those drafts show up in Drafts, and the run's report lists them as waiting.
6. Autopilot schedules a `sent_emails` row at status `scheduled`, inside the mission's send window, through `scheduleDraft`. `process-scheduled-emails` is still the only sender, with the caps it already enforces. A second scheduled row for the same lead is refused by that helper.
7. A draft is scheduled only when it is grounded in the research, the quality status is clear, the rubric was scored, and `evaluateSend` accepts a verdict just recorded for this account and this text. Anything else stays a draft with the reason.
8. If the mission has a sequence, the lead is enrolled so later touches stay on the existing sequence runner. Replies stay on the existing reply automation.

## Guardrails

Per mission, per day:

- Lead cap, clamped to the plan's existing daily sourcing cap.
- Send cap, clamped to that same lead cap. The mailbox and account send caps still live only in `process-scheduled-emails`.
- AI spend cap, summed from `ai_usage_events.cost_usd` since local midnight in the mission timezone. Default $5, hard ceiling $25. This is not a new price.

The mission pauses itself when:

- Recent bounce rate is at least 5% after 20 sends, or the mission's own threshold if you set one.
- Negative or spam replies (`not_interested`, `unsubscribe`, `spam`, `hostile`) are at least 15% after 8 replies.
- An unresolved deliverability alert of type `bounce_rate`, `blacklist`, `spam`, `complaint`, `reputation_drop`, or `auth_failure` is open.
- Search or research returns a provider error (timeouts, 429, 5xx).

Stop conditions: a stop date, or `max_runs` completed runs. Pausing and resuming is a status on the mission. Resume schedules the next future window. It does not replay missed days.

## Overnight report

Each run stores `report.summary` and `report.steps` on `agent_mission_runs`. The Missions page shows those steps with the same folded status list as agent chat. When the run finishes, one in-app push (`notifyMissionDigest`) and one email (`agent-mission-digest`) are sent. `agent_mission_digests` is unique per run and channel, so a retry does not send a second copy.

## Enable one workspace

Do this after the migration exists in the database. This change does not publish the project.

1. In the admin settings feature flags, turn on `agentMissions`. Leave it off everywhere else.
2. On the same page, under Agent missions access, enter the workspace email and grant it.
3. Sign in as that workspace. Missions appears in the sidebar. Create one mission, pick the agent, and leave the mode on Approval until a run looks right.
4. Confirm a row in `agent_mission_runs` after the next scheduled window, and that `agent_jobs.kind` is `mission`.

Turning the flag off or disabling the grant stops the next claim. A pass already in flight re-checks both and skips before it searches or schedules.

## What is not verified live

This was not published, and no production cron was started.

- The hosted `pg_cron` job `dispatch-agent-missions` was not observed firing.
- `fetch-external-leads`, `research-lead`, and `generate-email` were not called against live providers from a mission.
- No Gmail message was sent. Scheduling writes a `scheduled` row. The existing sender was not exercised by a mission row.
- The digest email was not delivered to a real inbox, and the push was not delivered to a device.
- Stripe plan lookup was not called. The cap numbers are checked against `PLAN_FEATURES` in unit tests.
- Bounce, complaint, and deliverability pause were checked with the decision function and with database claims, not against a live mailbox.
- Team-member access uses the same workspace-owner rule as Visitor Intelligence. A member session was not clicked through in a browser.
