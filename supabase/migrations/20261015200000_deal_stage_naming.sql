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

-- ── The rewrite must not look like a hundred deals closing at once ───────
--
-- webhooks_deals_upd fires AFTER UPDATE on every row this touches, and
-- trg_webhooks_deals compares OLD.stage to NEW.stage. 'closed-won' and
-- 'closed_won' are different strings, so each row would queue a
-- deal.stage_changed, a deal.updated, and — because the new spelling is
-- exactly what its closing branch tests for — a deal.closed.
--
-- The whole point of this migration is that deal.closed has never been able
-- to fire. Firing it for every deal ever won, in one burst, to whatever
-- integration is subscribed, would be a worse first impression than never
-- firing at all: every one of those deals closed months ago.
--
-- So the trigger is off for the rewrite and on again straight after. Only
-- webhooks_deals_upd is touched; the INSERT trigger is not involved, and
-- session_replication_role would have disabled every trigger on the table
-- including ones that keep other columns honest.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'webhooks_deals_upd' AND tgrelid = 'public.deals'::regclass
  ) THEN
    ALTER TABLE public.deals DISABLE TRIGGER webhooks_deals_upd;
  END IF;
END $$;

UPDATE public.deals
SET stage = 'closed_won'
WHERE stage = 'closed-won';

UPDATE public.deals
SET stage = 'closed_lost'
WHERE stage = 'closed-lost';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'webhooks_deals_upd' AND tgrelid = 'public.deals'::regclass
  ) THEN
    ALTER TABLE public.deals ENABLE TRIGGER webhooks_deals_upd;
  END IF;
END $$;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_stage_check
  CHECK (stage IN (
    'new', 'contacted', 'qualified', 'proposal', 'negotiation',
    'closed_won', 'closed_lost'
  ));

COMMENT ON COLUMN public.deals.stage IS
  'Sales stage. snake_case, like every other enumerated value in this schema. Held closed-won/closed-lost with a hyphen until 2026-10-15, which the deal.closed webhook trigger and the revenue panel both failed to match.';
