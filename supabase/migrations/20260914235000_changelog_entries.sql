-- The changelog, in the database rather than in a TypeScript file.
--
-- It lived in src/lib/changelog.ts, which meant every update required a deploy
-- and every entry was written by hand. The point of moving it is that merges
-- can draft their own entries and an admin publishes them, so the work is a
-- skim rather than a writing session.
--
-- Two tables because they have different lifecycles: entries are dated and
-- append-only in practice, the roadmap is a short mutable list that is rewritten
-- whenever priorities move.

create table if not exists public.changelog_entries (
  id uuid primary key default gen_random_uuid(),

  -- The release date, not the merge timestamp. Several merges on one day belong
  -- to one entry: a customer reading four entries dated the same day is reading
  -- four branches, which is the thing this replaces.
  entry_date date not null,

  title text not null,
  summary text not null default '',

  -- [{ tag, title, description, href? }]. Kept as jsonb rather than a child
  -- table because items are only ever read and written as a whole entry, and a
  -- join per entry buys nothing.
  items jsonb not null default '[]'::jsonb,

  -- draft: written by a merge, not visible to customers.
  -- published: visible. archived: withdrawn without losing the record.
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),

  -- Where the draft came from, for the admin review screen: PR numbers, titles,
  -- the commit sha. Never shown to customers.
  source jsonb not null default '{}'::jsonb,

  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One entry per day, so a second merge on the same day amends the first rather
-- than creating a rival. The drafting function depends on this to upsert.
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
  -- Hand-ordered: a roadmap's order is an editorial decision, not a timestamp.
  position integer not null default 0,
  visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists changelog_roadmap_order_idx
  on public.changelog_roadmap (visible, position);

alter table public.changelog_entries enable row level security;
alter table public.changelog_roadmap enable row level security;

-- Customers read what is published. They never see drafts, and `source` is the
-- only reason that matters here: it carries PR titles and branch names, which
-- are internal. Read access is column-blind, so the drafting function must keep
-- anything sensitive out of it — the status filter is what protects a draft, and
-- a published entry's source is assumed to be safe to expose.
drop policy if exists "changelog published is readable" on public.changelog_entries;
create policy "changelog published is readable"
  on public.changelog_entries for select
  using (status = 'published');

drop policy if exists "admins read every changelog entry" on public.changelog_entries;
create policy "admins read every changelog entry"
  on public.changelog_entries for select
  using (public.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "admins write changelog entries" on public.changelog_entries;
create policy "admins write changelog entries"
  on public.changelog_entries for all
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "roadmap visible items are readable" on public.changelog_roadmap;
create policy "roadmap visible items are readable"
  on public.changelog_roadmap for select
  using (visible = true);

drop policy if exists "admins manage the roadmap" on public.changelog_roadmap;
create policy "admins manage the roadmap"
  on public.changelog_roadmap for all
  using (public.has_role(auth.uid(), 'admin'::app_role))
  with check (public.has_role(auth.uid(), 'admin'::app_role));

-- Publishing reaches open tabs without a refresh, which is the half of "real
-- time" that a static file could never do.
--
-- Guarded rather than bare: `alter publication ... add table` errors if the
-- table is already a member, and applied migrations get re-run here (Lovable
-- re-commits them under generated filenames). A migration that cannot be
-- applied twice is a migration that breaks the next deploy rather than this
-- one. The publication's own existence is checked too, because a fresh local
-- database has no supabase_realtime.
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
  -- Stamped once, when it first goes live. Editing a published entry later
  -- should not move it up the page.
  if new.status = 'published' and (old.status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

drop trigger if exists changelog_entries_touch on public.changelog_entries;
create trigger changelog_entries_touch
  before update on public.changelog_entries
  for each row execute function public.touch_changelog_updated_at();

drop trigger if exists changelog_roadmap_touch on public.changelog_roadmap;
create trigger changelog_roadmap_touch
  before update on public.changelog_roadmap
  for each row execute function public.touch_changelog_updated_at();
