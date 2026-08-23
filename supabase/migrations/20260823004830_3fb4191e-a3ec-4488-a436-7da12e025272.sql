create table if not exists public.scan_gate_leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now(),
  posthog_distinct_id text,
  scan_context jsonb
);

create unique index if not exists scan_gate_leads_email_key on public.scan_gate_leads (lower(email));

grant insert on public.scan_gate_leads to anon;
grant insert, select on public.scan_gate_leads to authenticated;
grant all on public.scan_gate_leads to service_role;

alter table public.scan_gate_leads enable row level security;

drop policy if exists "Anyone can submit a scan-gate email" on public.scan_gate_leads;
create policy "Anyone can submit a scan-gate email"
  on public.scan_gate_leads for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admins can read scan gate leads" on public.scan_gate_leads;
create policy "Admins can read scan gate leads"
  on public.scan_gate_leads for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));