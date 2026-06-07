-- KlarBudget migration: legatura parinte-copil pentru Token Economy.
-- Ruleaza in Supabase SQL Editor.
-- Scop: copilul logat cu cont separat citeste datele familiei parintelui,
-- dar vede doar propriul portofel si poate trimite doar cereri.

create table if not exists public.kb_family_child_links (
  id uuid primary key default gen_random_uuid(),
  parent_user_id uuid not null references auth.users(id) on delete cascade,
  child_user_id uuid not null references auth.users(id) on delete cascade,
  child_name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(child_user_id)
);

alter table public.kb_family_child_links enable row level security;

drop policy if exists "kb_family_child_links_parent_all" on public.kb_family_child_links;
create policy "kb_family_child_links_parent_all" on public.kb_family_child_links
for all using (auth.uid() = parent_user_id) with check (auth.uid() = parent_user_id);

drop policy if exists "kb_family_child_links_child_read" on public.kb_family_child_links;
create policy "kb_family_child_links_child_read" on public.kb_family_child_links
for select using (auth.uid() = child_user_id and active = true);

drop trigger if exists kb_family_child_links_touch_updated_at on public.kb_family_child_links;
create trigger kb_family_child_links_touch_updated_at before update on public.kb_family_child_links
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_family_child_links_parent_idx on public.kb_family_child_links(parent_user_id);
create index if not exists kb_family_child_links_child_idx on public.kb_family_child_links(child_user_id);

-- Coloane folosite de Token Economy nou.
-- Sunt aici ca scriptul sa functioneze si daca KB_MIGRATION_KIDS_TASKS.sql nu a fost rulat inainte.
alter table public.family_rewards_shop
add column if not exists child_id uuid references public.family_wallets(id) on delete set null;

alter table public.family_rewards_shop
add column if not exists is_active boolean not null default true;

update public.family_rewards_shop
set is_active = coalesce(is_active, is_available, true);

-- Tabele folosite pentru sarcini si cereri copii.
-- Sunt create aici ca scriptul sa poata fi rulat independent.
create table if not exists public.kb_kid_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid references public.family_wallets(id) on delete cascade,
  title text not null,
  description text,
  icon text default '⭐',
  category text default 'Casa',
  coins integer not null default 1 check (coins >= 0),
  frequency text default 'flexible',
  requires_approval boolean default true,
  active boolean default true,
  streak_target_days integer default 5,
  streak_bonus_coins integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.kb_kid_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  child_id uuid not null references public.family_wallets(id) on delete cascade,
  request_type text not null check (request_type in ('task_completion', 'reward_redeem')),
  task_id uuid references public.kb_kid_tasks(id) on delete cascade,
  reward_id uuid references public.family_rewards_shop(id) on delete cascade,
  coins integer not null default 0,
  status text default 'pending' check (status in ('pending', 'approved', 'rejected')),
  note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.kb_kid_tasks enable row level security;
alter table public.kb_kid_requests enable row level security;

drop trigger if exists kb_kid_tasks_touch_updated_at on public.kb_kid_tasks;
create trigger kb_kid_tasks_touch_updated_at before update on public.kb_kid_tasks
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_kid_requests_touch_updated_at on public.kb_kid_requests;
create trigger kb_kid_requests_touch_updated_at before update on public.kb_kid_requests
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_kid_tasks_user_active_idx on public.kb_kid_tasks(user_id, active);
create index if not exists kb_kid_requests_user_status_idx on public.kb_kid_requests(user_id, status);
create index if not exists kb_kid_requests_child_status_idx on public.kb_kid_requests(child_id, status);

-- Inlocuieste politicile vechi cu politici parent + child-read/request.

drop policy if exists "family_wallets_all_own" on public.family_wallets;
drop policy if exists "family_wallets_parent_all" on public.family_wallets;
create policy "family_wallets_parent_all" on public.family_wallets
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "family_wallets_child_read_own" on public.family_wallets;
create policy "family_wallets_child_read_own" on public.family_wallets
for select using (
  exists (
    select 1
    from public.kb_family_child_links link
    where link.child_user_id = auth.uid()
      and link.parent_user_id = family_wallets.user_id
      and link.active = true
      and lower(link.child_name) = lower(family_wallets.member_name)
  )
);

drop policy if exists "family_rewards_shop_all_own" on public.family_rewards_shop;
drop policy if exists "family_rewards_shop_parent_all" on public.family_rewards_shop;
create policy "family_rewards_shop_parent_all" on public.family_rewards_shop
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "family_rewards_shop_child_read" on public.family_rewards_shop;
create policy "family_rewards_shop_child_read" on public.family_rewards_shop
for select using (
  exists (
    select 1
    from public.kb_family_child_links link
    join public.family_wallets wallet
      on wallet.user_id = link.parent_user_id
     and lower(wallet.member_name) = lower(link.child_name)
    where link.child_user_id = auth.uid()
      and link.parent_user_id = family_rewards_shop.user_id
      and link.active = true
      and (family_rewards_shop.child_id is null or family_rewards_shop.child_id = wallet.id)
  )
);

drop policy if exists "family_transactions_all_own" on public.family_transactions;
drop policy if exists "family_transactions_parent_all" on public.family_transactions;
create policy "family_transactions_parent_all" on public.family_transactions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "family_transactions_child_read_own" on public.family_transactions;
create policy "family_transactions_child_read_own" on public.family_transactions
for select using (
  exists (
    select 1
    from public.kb_family_child_links link
    join public.family_wallets wallet
      on wallet.id = family_transactions.wallet_id
     and wallet.user_id = link.parent_user_id
     and lower(wallet.member_name) = lower(link.child_name)
    where link.child_user_id = auth.uid()
      and link.parent_user_id = family_transactions.user_id
      and link.active = true
  )
);

drop policy if exists "kb_kid_tasks_all_own" on public.kb_kid_tasks;
drop policy if exists "kb_kid_tasks_parent_all" on public.kb_kid_tasks;
create policy "kb_kid_tasks_parent_all" on public.kb_kid_tasks
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_kid_tasks_child_read" on public.kb_kid_tasks;
create policy "kb_kid_tasks_child_read" on public.kb_kid_tasks
for select using (
  exists (
    select 1
    from public.kb_family_child_links link
    join public.family_wallets wallet
      on wallet.user_id = link.parent_user_id
     and lower(wallet.member_name) = lower(link.child_name)
    where link.child_user_id = auth.uid()
      and link.parent_user_id = kb_kid_tasks.user_id
      and link.active = true
      and (kb_kid_tasks.child_id is null or kb_kid_tasks.child_id = wallet.id)
  )
);

drop policy if exists "kb_kid_requests_all_own" on public.kb_kid_requests;
drop policy if exists "kb_kid_requests_parent_all" on public.kb_kid_requests;
create policy "kb_kid_requests_parent_all" on public.kb_kid_requests
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_kid_requests_child_read_own" on public.kb_kid_requests;
create policy "kb_kid_requests_child_read_own" on public.kb_kid_requests
for select using (
  exists (
    select 1
    from public.kb_family_child_links link
    join public.family_wallets wallet
      on wallet.id = kb_kid_requests.child_id
     and wallet.user_id = link.parent_user_id
     and lower(wallet.member_name) = lower(link.child_name)
    where link.child_user_id = auth.uid()
      and link.parent_user_id = kb_kid_requests.user_id
      and link.active = true
  )
);

drop policy if exists "kb_kid_requests_child_insert_own" on public.kb_kid_requests;
create policy "kb_kid_requests_child_insert_own" on public.kb_kid_requests
for insert with check (
  exists (
    select 1
    from public.kb_family_child_links link
    join public.family_wallets wallet
      on wallet.id = kb_kid_requests.child_id
     and wallet.user_id = link.parent_user_id
     and lower(wallet.member_name) = lower(link.child_name)
    where link.child_user_id = auth.uid()
      and link.parent_user_id = kb_kid_requests.user_id
      and link.active = true
  )
);

-- Repara cererile create inainte de legarea copilului.
-- Daca un copil a trimis cereri sub user_id-ul lui, le mutam sub user_id-ul parintelui
-- si le legam de portofelul parintelui cu acelasi nume. Nu sterge nimic.
update public.kb_kid_requests request
set user_id = link.parent_user_id,
    child_id = parent_wallet.id
from public.kb_family_child_links link
join public.family_wallets child_wallet
  on child_wallet.user_id = link.child_user_id
join public.family_wallets parent_wallet
  on parent_wallet.user_id = link.parent_user_id
 and lower(parent_wallet.member_name) = lower(link.child_name)
where request.user_id = link.child_user_id
  and child_wallet.id = request.child_id
  and link.active = true
  and lower(child_wallet.member_name) = lower(link.child_name);

-- Diagnostic rapid dupa rulare:
-- select child_name, active, parent_user_id, child_user_id from public.kb_family_child_links;
-- select user_id, child_id, request_type, status, note, created_at from public.kb_kid_requests order by created_at desc limit 20;

-- Exemplu de legare copil -> parinte.
-- IMPORTANT: inlocuieste 'email-parinte@example.com' cu emailul real al parintelui.
-- Pentru Veronica, copilul este mtclemur@gmx.de.
--
-- insert into public.kb_family_child_links (parent_user_id, child_user_id, child_name, active)
-- select parent.id, child.id, 'Veronica', true
-- from auth.users parent
-- cross join auth.users child
-- where lower(parent.email) = 'email-parinte@example.com'
--   and lower(child.email) = 'mtclemur@gmx.de'
-- on conflict (child_user_id) do update
-- set parent_user_id = excluded.parent_user_id,
--     child_name = excluded.child_name,
--     active = true;
