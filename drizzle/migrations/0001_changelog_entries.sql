create table if not exists public.changelog_entries (
  id uuid primary key default gen_random_uuid(),
  entry_date date not null,
  title text not null,
  summary text not null default '',
  items jsonb not null default '[]'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  source jsonb not null default '{}'::jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists changelog_entries_date_idx
  on public.changelog_entries (entry_date);

create index if not exists changelog_entries_published_idx
  on public.changelog_entries (status, entry_date desc);

create table if not exists public.changelog_roadmap (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  status text not null default 'exploring'
    check (status in ('building', 'next', 'exploring')),
  position integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists changelog_roadmap_order_idx
  on public.changelog_roadmap (visible, position);

-- Data API access (required: PostgREST does not grant by default on public schema).
-- Published/visible rows are readable by everyone per the policies below.
grant select, insert, update, delete on public.changelog_entries to authenticated;
grant select on public.changelog_entries to anon;
grant all on public.changelog_entries to service_role;
grant select, insert, update, delete on public.changelog_roadmap to authenticated;
grant select on public.changelog_roadmap to anon;
grant all on public.changelog_roadmap to service_role;

alter table public.changelog_entries enable row level security;
alter table public.changelog_roadmap enable row level security;

create policy "changelog published is readable"
  on public.changelog_entries for select
  using (status = 'published');

create policy "admins read every changelog entry"
  on public.changelog_entries for select
  using (public.has_role(auth.uid(), 'admin'::app_role));

create policy "admins write changelog entries"
  on public.changelog_entries for all
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

create policy "roadmap visible items are readable"
  on public.changelog_roadmap for select
  using (visible = true);

create policy "admins manage the roadmap"
  on public.changelog_roadmap for all
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'changelog_entries'
    ) then
      alter publication supabase_realtime add table public.changelog_entries;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'changelog_roadmap'
    ) then
      alter publication supabase_realtime add table public.changelog_roadmap;
    end if;
  end if;
end $$;

create or replace function public.touch_changelog_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  if new.status = 'published' and (old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger changelog_entries_touch
  before update on public.changelog_entries
  for each row execute function public.touch_changelog_updated_at();

create trigger changelog_roadmap_touch
  before update on public.changelog_roadmap
  for each row execute function public.touch_changelog_updated_at();

-- Register the new tables in the schema contract (backfill that is part of this
-- additive change, per the schema-contract rule).
insert into public.schema_contract (table_name, column_name, note)
select t.table_name, c.column_name, 'changelog feature tables'
from (values ('changelog_entries'), ('changelog_roadmap')) as t(table_name)
cross join lateral (
  select column_name from information_schema.columns
  where table_schema = 'public' and table_name = t.table_name
) c
on conflict do nothing;