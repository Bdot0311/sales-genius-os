ALTER TABLE public.agent_actions DROP CONSTRAINT IF EXISTS agent_actions_action_type_check;
ALTER TABLE public.agent_actions ADD CONSTRAINT agent_actions_action_type_check CHECK (
  action_type = ANY (ARRAY[
    'sync'::text,
    'classify'::text,
    'reply_sent'::text,
    'meeting_booked'::text,
    'unsubscribed'::text,
    'closed_thread'::text,
    'skipped'::text,
    'error'::text,
    'lead_found'::text,
    'awaiting_approval'::text,
    'outreach_sent'::text,
    'rejected'::text
  ])
);

ALTER TABLE public.agent_actions DROP CONSTRAINT IF EXISTS agent_actions_status_check;
ALTER TABLE public.agent_actions ADD CONSTRAINT agent_actions_status_check CHECK (
  status = ANY (ARRAY[
    'completed'::text,
    'failed'::text,
    'skipped'::text,
    'pending'::text
  ])
);