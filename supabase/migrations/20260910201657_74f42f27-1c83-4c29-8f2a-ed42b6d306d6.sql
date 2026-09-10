-- A signed-in user may learn that a platform-wide problem is open, and nothing
-- more: only the category, how serious it is, and when it started. The alert
-- message and details stay admin-only, because they carry internal specifics
-- (customer ids, upstream payloads) that the banner must never show.
create or replace function public.get_service_status()
returns table (category text, severity text, since timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select a.category,
         a.severity,
         min(a.created_at) as since
  from public.system_alerts a
  where a.resolved = false
    -- An alert tied to one account is that person's problem, not an outage.
    and a.user_id is null
    and a.severity in ('error', 'critical')
    -- Stale alerts nobody resolved must not sit on every dashboard forever.
    and a.created_at > now() - interval '12 hours'
    -- Only categories with user-facing wording. Anything else stays internal.
    and a.category in (
      'system_health',
      'email_delivery_failure',
      'outreach_send_error',
      'sequence_dispatch_failure',
      'lead_provider_failure',
      'lead_search_failure',
      'enrichment_failure',
      'ai_credits_exhausted',
      'ai_generation_failure',
      'oauth_refresh_failure',
      'calendar_sync_failure',
      'stripe_webhook_failure'
    )
  group by a.category, a.severity
  order by min(a.created_at) desc
$$;

revoke all on function public.get_service_status() from public;
grant execute on function public.get_service_status() to authenticated;