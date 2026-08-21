-- Deliverability alerts never left the app.
--
-- compute-reputation and deliverability-alerts-scan both write rows to
-- deliverability_alerts, and the dashboard subscribes to them over realtime.
-- Nothing emailed, pushed or texted. So the user who most needs to know their
-- domain was blacklisted — the one running campaigns on autopilot rather than
-- watching a dashboard — found out days later.
--
-- notified_at is the dedupe. An alert is emailed once: the nightly scan
-- re-runs while the underlying issue persists, and without a stamp every run
-- would re-send the same warning until the user fixed it, which trains people
-- to filter the alerts that matter most.

ALTER TABLE public.deliverability_alerts
  ADD COLUMN IF NOT EXISTS notified_at timestamptz;

-- The notify pass asks one question: which critical alerts are still active and
-- have not been emailed. A partial index keeps that a lookup rather than a scan
-- of every alert ever raised, and rows already notified drop out of the index
-- once stamped.
CREATE INDEX IF NOT EXISTS idx_deliverability_alerts_pending_notification
  ON public.deliverability_alerts (user_id, created_at)
  WHERE notified_at IS NULL AND status = 'active';

COMMENT ON COLUMN public.deliverability_alerts.notified_at IS
  'When the user was emailed about this alert. NULL = not yet sent. Set by deliverability-alerts-scan; only critical alerts are ever emailed.';
