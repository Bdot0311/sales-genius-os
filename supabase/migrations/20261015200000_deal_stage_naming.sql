-- deals.stage is spelled two ways, and the half nobody writes is the half the
-- code checks.
--
-- The column's CHECK allows 'closed-won' and 'closed-lost' with a hyphen, and
-- that is what the app writes. Three things read the underscore form that the
-- CHECK makes impossible:
--
--   trg_webhooks_deals        IF NEW.stage IN ('closed_won', 'closed_lost')
--   EmailPerformanceStats     stage === "won" || stage === "closed_won"
--   WebhookTestDialog         sends stage: "closed_won" in its sample payload
--
-- So the deal.closed webhook has never fired for anybody: no row can hold the
-- value its condition tests for. The revenue panel counts won deals the same
-- way and has always counted zero. And the webhook test dialog shows
-- integrators a payload shape production cannot produce, so anyone who built
-- against it built against a value they will never receive.
--
-- Nothing is ambiguous about which spelling is right. Every other enumerated
-- value in this schema is snake_case — leads.pipeline_stage is 'no_response',
-- 'meeting_booked', 'not_interested' — and the hyphen exists in exactly one
-- column. The data moves to snake_case and the CHECK moves with it.
--
-- Changing stored values changes what deal.stage_changed puts on the wire for
-- anyone already consuming it. That is worth saying out loud, and it is still
-- the right way round: the payload currently carries a value that the same
-- webhook's own deal.closed event is written to disagree with.

-- Widen before rewriting: the rows cannot hold the new values while the old
-- constraint is still on the table.
ALTER TABLE public.deals DROP CONSTRAINT IF EXISTS deals_stage_check;

UPDATE public.deals
SET stage = 'closed_won'
WHERE stage = 'closed-won';

UPDATE public.deals
SET stage = 'closed_lost'
WHERE stage = 'closed-lost';

ALTER TABLE public.deals
  ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    'new', 'contacted', 'qualified', 'proposal', 'negotiation',
    'closed_won', 'closed_lost'
  ));

COMMENT ON COLUMN public.deals.stage IS
  'Sales stage. snake_case, like every other enumerated value in this schema. Held closed-won/closed-lost with a hyphen until 2026-10-15, which the deal.closed webhook trigger and the revenue panel both failed to match.';
