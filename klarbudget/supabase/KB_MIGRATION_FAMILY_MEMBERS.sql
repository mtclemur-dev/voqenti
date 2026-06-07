-- KlarBudget migration: membri familie si roluri pe email.
-- Ruleaza in Supabase SQL Editor.
-- Scop: Victor vede modul complet, Doina vede datele familiei in modul simplu.

create table if not exists public.kb_family_members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  family_owner_user_id uuid references auth.users(id) on delete cascade,
  email text not null unique,
  display_name text not null,
  role text not null default 'parent' check (role in ('admin', 'parent', 'child')),
  family_role text check (family_role in ('father', 'mother', 'daughter', 'son')),
  default_view text not null default 'family_simple' check (default_view in ('detailed', 'family_simple', 'kid_mode')),
  can_edit_finances boolean not null default false,
  can_manage_children boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kb_family_members enable row level security;

drop policy if exists "kb_family_members_self_read" on public.kb_family_members;
create policy "kb_family_members_self_read" on public.kb_family_members
for select using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

drop policy if exists "kb_family_members_admin_all" on public.kb_family_members;
create policy "kb_family_members_admin_all" on public.kb_family_members
for all using (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mtclemur@gmail.com')
with check (lower(coalesce(auth.jwt() ->> 'email', '')) = 'mtclemur@gmail.com');

drop trigger if exists kb_family_members_touch_updated_at on public.kb_family_members;
create trigger kb_family_members_touch_updated_at before update on public.kb_family_members
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_family_members_email_idx on public.kb_family_members(lower(email));
create index if not exists kb_family_members_owner_idx on public.kb_family_members(family_owner_user_id);

-- Acces RLS pentru membrii configurati ai familiei.
-- Nu inlocuieste politicile existente "own"; adauga drepturi prin kb_family_members.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'kb_incomes',
    'kb_expenses',
    'kb_debts',
    'kb_payment_status',
    'kb_settings',
    'kb_accounts',
    'kb_account_snapshots',
    'kb_daily_entries',
    'kb_daily_closures',
    'kb_work_absences',
    'kb_shopping_list',
    'kb_weekly_offers',
    'kb_stores',
    'kb_offer_sources',
    'kb_price_history',
    'kb_receipts',
    'kb_receipt_items',
    'kb_utility_readings'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists "%s_family_member_read" on public.%I', table_name, table_name);
      execute format(
        'create policy "%s_family_member_read" on public.%I for select using (
          exists (
            select 1
            from public.kb_family_members member
            where lower(member.email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
              and member.active = true
              and member.family_owner_user_id = %I.user_id
              and member.can_edit_finances = true
          )
        )',
        table_name,
        table_name,
        table_name
      );

      execute format('drop policy if exists "%s_family_member_write" on public.%I', table_name, table_name);
      execute format(
        'create policy "%s_family_member_write" on public.%I for all using (
          exists (
            select 1
            from public.kb_family_members member
            where lower(member.email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
              and member.active = true
              and member.family_owner_user_id = %I.user_id
              and member.can_edit_finances = true
          )
        ) with check (
          exists (
            select 1
            from public.kb_family_members member
            where lower(member.email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
              and member.active = true
              and member.family_owner_user_id = %I.user_id
              and member.can_edit_finances = true
          )
        )',
        table_name,
        table_name,
        table_name,
        table_name
      );
    end if;
  end loop;
end $$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'family_wallets',
    'family_rewards_shop',
    'family_transactions',
    'kb_kid_tasks',
    'kb_kid_requests',
    'kb_family_messages',
    'kb_family_settings'
  ] loop
    if to_regclass('public.' || table_name) is not null then
      execute format('drop policy if exists "%s_family_member_children" on public.%I', table_name, table_name);
      execute format(
        'create policy "%s_family_member_children" on public.%I for all using (
          exists (
            select 1
            from public.kb_family_members member
            where lower(member.email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
              and member.active = true
              and member.family_owner_user_id = %I.user_id
              and member.can_manage_children = true
          )
        ) with check (
          exists (
            select 1
            from public.kb_family_members member
            where lower(member.email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
              and member.active = true
              and member.family_owner_user_id = %I.user_id
              and member.can_manage_children = true
          )
        )',
        table_name,
        table_name,
        table_name,
        table_name
      );
    end if;
  end loop;
end $$;

-- Victor / tata / admin.
insert into public.kb_family_members (
  user_id,
  family_owner_user_id,
  email,
  display_name,
  role,
  family_role,
  default_view,
  can_edit_finances,
  can_manage_children,
  active
)
select
  id,
  id,
  lower(email),
  'Victor',
  'admin',
  'father',
  'detailed',
  true,
  true,
  true
from auth.users
where lower(email) = 'mtclemur@gmail.com'
on conflict (email) do update
set user_id = excluded.user_id,
    family_owner_user_id = excluded.family_owner_user_id,
    display_name = excluded.display_name,
    role = excluded.role,
    family_role = excluded.family_role,
    default_view = excluded.default_view,
    can_edit_finances = excluded.can_edit_finances,
    can_manage_children = excluded.can_manage_children,
    active = true;

-- Doina / mama / modul simplu familie.
insert into public.kb_family_members (
  user_id,
  family_owner_user_id,
  email,
  display_name,
  role,
  family_role,
  default_view,
  can_edit_finances,
  can_manage_children,
  active
)
select
  doina.id,
  victor.id,
  lower(doina.email),
  'Doina',
  'parent',
  'mother',
  'family_simple',
  true,
  true,
  true
from auth.users doina
cross join auth.users victor
where lower(doina.email) = 'plamadealadoina2@gmail.com'
  and lower(victor.email) = 'mtclemur@gmail.com'
on conflict (email) do update
set user_id = excluded.user_id,
    family_owner_user_id = excluded.family_owner_user_id,
    display_name = excluded.display_name,
    role = excluded.role,
    family_role = excluded.family_role,
    default_view = excluded.default_view,
    can_edit_finances = excluded.can_edit_finances,
    can_manage_children = excluded.can_manage_children,
    active = true;

insert into public.kb_profiles (id, preferred_language, currency, account_role)
select id, 'ro', 'EUR', 'parent'
from auth.users
where lower(email) = 'plamadealadoina2@gmail.com'
on conflict (id) do update
set account_role = 'parent';

-- Verificare dupa rulare.
select
  member.display_name,
  member.email,
  member.role,
  member.default_view,
  member.can_edit_finances,
  member.can_manage_children,
  owner.email as owner_email
from public.kb_family_members member
left join auth.users owner on owner.id = member.family_owner_user_id
where member.email in ('mtclemur@gmail.com', 'plamadealadoina2@gmail.com')
order by member.email;
