ALTER TABLE public.deliverability_alerts
  DROP CONSTRAINT IF EXISTS deliverability_alerts_alert_type_check;

ALTER TABLE public.deliverability_alerts
  ADD CONSTRAINT deliverability_alerts_alert_type_check
  CHECK (alert_type IN (
    'reputation_drop',
    'blacklist',
    'auth_failure',
    'bounce_spike',
    'complaint_spike',
    'warmup_paused',
    'bounce_rate',
    'complaint_rate',
    'placement_drop',
    'mailbox_unavailable',
    'mailbox_quarantined'
  ));