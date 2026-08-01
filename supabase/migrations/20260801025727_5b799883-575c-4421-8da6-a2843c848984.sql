INSERT INTO public.admin_settings (setting_key, setting_value, description, category)
VALUES (
  'billing_notifications',
  jsonb_build_object(
    'enabled', true,
    'recipients', '[]'::jsonb,
    'events', jsonb_build_object(
      'billing_cancellation', true,
      'billing_cancellation_scheduled', true,
      'billing_payment_failed', true,
      'billing_payment_action_required', true,
      'billing_dispute', true,
      'billing_subscription_paused', true
    )
  ),
  'Email alerts for billing events: who is notified and which events trigger an email.',
  'billing'
)
ON CONFLICT (setting_key) DO NOTHING;