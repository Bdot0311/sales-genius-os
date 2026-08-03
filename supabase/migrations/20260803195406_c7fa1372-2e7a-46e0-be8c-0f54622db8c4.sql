alter table public.agent_configs
  add column if not exists role text not null default 'full_cycle',
  add column if not exists is_primary boolean not null default true;

do $$ begin
  alter table public.agent_configs
    add constraint agent_configs_role_check
    check (role in ('lead_gen','outreach','replies','full_cycle'));
exception when duplicate_object then null; end $$;

alter table public.agent_configs drop constraint if exists agent_configs_user_id_key;

create unique index if not exists agent_configs_one_primary_per_user
  on public.agent_configs (user_id) where is_primary;