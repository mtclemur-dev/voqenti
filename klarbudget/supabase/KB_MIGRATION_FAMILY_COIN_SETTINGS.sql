-- KlarBudget migration: setari valoare monede pentru Family Token Economy.
-- Ruleaza in Supabase SQL Editor.
-- Nu modifica agresiv valorile existente. Doar creeaza tabela de setari per familie.

create table if not exists public.kb_family_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  coin_value_eur numeric(8,4) not null default 0.10 check (coin_value_eur > 0),
  show_child_eur boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kb_family_settings enable row level security;

drop policy if exists "kb_family_settings_parent_all" on public.kb_family_settings;
create policy "kb_family_settings_parent_all" on public.kb_family_settings
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_family_settings_child_read" on public.kb_family_settings;
create policy "kb_family_settings_child_read" on public.kb_family_settings
for select using (
  exists (
    select 1
    from public.kb_family_child_links link
    where link.child_user_id = auth.uid()
      and link.parent_user_id = kb_family_settings.user_id
      and link.active = true
  )
);

drop trigger if exists kb_family_settings_touch_updated_at on public.kb_family_settings;
create trigger kb_family_settings_touch_updated_at before update on public.kb_family_settings
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_family_settings_user_idx on public.kb_family_settings(user_id);

