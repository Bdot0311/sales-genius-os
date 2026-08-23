drop index if exists public.scan_gate_leads_email_key;
create unique index if not exists scan_gate_leads_email_unique on public.scan_gate_leads (email);