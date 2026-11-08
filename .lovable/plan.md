# Let normal emails send again

## The problem (confirmed)
The last big update added a strict "research-only" check to every email send. It only lets through a short opener made of a greeting, one exact sentence from stored research, one question, and your name. Anything else gets "Not sent", including:

- emails you write yourself in Outreach Studio (a "Best," line, a signature, or a link fails it)
- bulk sends
- emails sent by Grok or other connected tools, and through the API
- Inbox replies in a thread where the prospect hasn't answered yet
- the email teammates get when a lead is assigned to them
- any lead without new research, which covers every lead saved before this update

## The fix
Use the strict research check only on the AI first-touch emails it was built for. Every other send goes back to the checks it had before:

1. **No lead attached** (lead-assignment notices, a send to a plain address over the API or a connected tool): skip the research check. Unsubscribe, invalid-address and daily-limit checks and the existing quality rules still apply.
2. **A follow-up in your own thread** (the thread already has an email you sent): skip the research check. The quality rules and score check stay on until the prospect replies, the same as before.
3. **First email to a lead:**
   - AI-written emails (the AI sales agent, agent approvals, agent tests and AI drafts) still get the strict research check, because writing time already holds them to it.
   - Emails you write or edit yourself, bulk sends, and API/connected-tool sends go back to the quality rules and score check only. Those rules already block made-up numbers and claims.
4. "Not sent" messages stay the same for anything still blocked.

## Decision needed
Step 3 means a first email you write yourself no longer needs research on file. If you'd rather keep that rule for all first emails, I'll make the strict check skip only the signature, sign-off and link lines, and still require research on file.

## Technical details
- `send-email/index.ts`: work out `evidenceRequired` on the server. It's true only when a lead id belongs to the owner, there's no owned `sent_emails` row for `threadId`, and the caller is an agent path (`agent-run`, `agent-approvals`, `agent-test`, called with the service role and an agent marker the server checks, never a body flag the user controls). When it's false, skip `ownedDraftViolations` and keep `outboundGateFindings`, the verdict and the rubric exactly as they are.
- Widen `isVerifiedReply` into an "owned thread" check for the research gate only. The quality-gate exemption still needs `replied_at`.
- Add regression tests in `src/lib/`: a lead-assignment notice, a Studio body with a signature/link, an MCP send with no lead, and a first follow-up in an owned thread must not return `research_required`. An agent first touch with no snapshot must still return it.
- Redeploy `send-email`. Resolve finding `b44da6b1-…` as fixed.
