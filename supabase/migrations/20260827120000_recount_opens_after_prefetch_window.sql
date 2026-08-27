-- Open tracking was counting mailbox providers as people.
--
-- email_open_events held ten counted "opens" inside fifteen minutes of send —
-- 116s, 124s, 174s, then five inside one five-minute band — in tight clusters
-- that trail each send batch. Nine of the ten carried Gmail's image-proxy
-- agent; the tenth carried the bare `Mozilla/5.0` that Apple Mail Privacy
-- Protection sends. The 90-second grace period the tracker used was far too
-- short to catch either.
--
-- track-email-open now gives proxying providers a 600-second window and never
-- counts an MPP fetch at any delay. This re-runs those rules over the history
-- so the numbers already on screen match the ones the tracker would produce
-- today. Nothing is deleted: the events stay, they are only reclassified, and
-- the reason is recorded on each row.

-- 1. Reclassify events that today's rules would not count.
UPDATE public.email_open_events
SET counted = false,
    skip_reason = CASE
      WHEN btrim(coalesce(user_agent, '')) ~* '^mozilla/5\.0\s*(\(\s*\))?$' THEN 'apple_mpp'
      ELSE 'provider_prefetch'
    END
WHERE counted
  AND (
    btrim(coalesce(user_agent, '')) ~* '^mozilla/5\.0\s*(\(\s*\))?$'
    OR (
      coalesce(user_agent, '') ~* '(googleimageproxy|ggpht\.com|googleusercontent|yahoomailproxy|yandexmail)'
      AND seconds_since_send IS NOT NULL
      AND seconds_since_send < 600
    )
  );

-- 2. Rebuild the counters on sent_emails from the surviving events.
--
-- Only for sends that the events table actually covers. Anything older was
-- tracked before per-hit logging existed, so there are no events to rebuild
-- from and clearing it would destroy the only record there is.
--
-- A click or a reply is proof of a human regardless of what the pixel did, so
-- those sends keep the open they already have.
WITH covered AS (
  SELECT DISTINCT sent_email_id
  FROM public.email_open_events
  WHERE sent_email_id IS NOT NULL
),
counted_agg AS (
  SELECT sent_email_id,
         min(occurred_at) AS first_open,
         max(occurred_at) AS last_open,
         count(*)::int    AS opens
  FROM public.email_open_events
  WHERE counted AND sent_email_id IS NOT NULL
  GROUP BY sent_email_id
)
UPDATE public.sent_emails s
SET opened_at      = CASE WHEN s.clicked_at IS NOT NULL OR s.replied_at IS NOT NULL
                          THEN s.opened_at ELSE a.first_open END,
    last_opened_at = CASE WHEN s.clicked_at IS NOT NULL OR s.replied_at IS NOT NULL
                          THEN s.last_opened_at ELSE a.last_open END,
    open_count     = CASE WHEN s.clicked_at IS NOT NULL OR s.replied_at IS NOT NULL
                          THEN s.open_count ELSE coalesce(a.opens, 0) END
FROM covered c
LEFT JOIN counted_agg a ON a.sent_email_id = c.sent_email_id
WHERE s.id = c.sent_email_id;

-- 3. Sends from before per-hit logging: apply the same window blind.
--
-- There is no user agent to judge these on, only the delay. An "open" that
-- landed within ten minutes of send, with no click and no reply behind it, is
-- the prefetch pattern and nothing else.
UPDATE public.sent_emails s
SET opened_at = NULL,
    open_count = 0,
    last_opened_at = NULL
WHERE s.opened_at IS NOT NULL
  AND s.sent_at IS NOT NULL
  AND s.clicked_at IS NULL
  AND s.replied_at IS NULL
  AND s.opened_at - s.sent_at < interval '600 seconds'
  AND NOT EXISTS (
    SELECT 1 FROM public.email_open_events e WHERE e.sent_email_id = s.id
  );
