create table if not exists public.email_optouts (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  opted_out_at timestamptz default now(),
  created_at timestamptz default now()
);

alter table public.email_optouts enable row level security;

create policy "Service role full access" on public.email_optouts
  using (true) with check (true);
