-- KlarBudget migration: Family Token Economy / Monede virtuale copii.
-- Ruleaza in Supabase SQL Editor.
-- Creeaza tabelele cerute family_* si adauga user_id pentru izolarea datelor pe cont.

create table if not exists public.family_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  member_name text not null,
  balance integer not null default 0 check (balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, member_name)
);

create table if not exists public.family_rewards_shop (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  cost integer not null check (cost > 0),
  icon text not null default '🎁',
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.family_wallets(id) on delete cascade,
  amount integer not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.family_reward_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid not null references public.family_wallets(id) on delete cascade,
  reward_id uuid references public.family_rewards_shop(id) on delete set null,
  reward_title text not null,
  reward_cost integer not null check (reward_cost > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  parent_note text
);

alter table public.family_wallets enable row level security;
alter table public.family_rewards_shop enable row level security;
alter table public.family_transactions enable row level security;
alter table public.family_reward_requests enable row level security;

drop policy if exists "family_wallets_all_own" on public.family_wallets;
create policy "family_wallets_all_own" on public.family_wallets
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "family_rewards_shop_all_own" on public.family_rewards_shop;
create policy "family_rewards_shop_all_own" on public.family_rewards_shop
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "family_transactions_all_own" on public.family_transactions;
create policy "family_transactions_all_own" on public.family_transactions
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "family_reward_requests_all_own" on public.family_reward_requests;
create policy "family_reward_requests_all_own" on public.family_reward_requests
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.kb_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists family_wallets_touch_updated_at on public.family_wallets;
create trigger family_wallets_touch_updated_at before update on public.family_wallets
for each row execute function public.kb_touch_updated_at();

drop trigger if exists family_rewards_shop_touch_updated_at on public.family_rewards_shop;
create trigger family_rewards_shop_touch_updated_at before update on public.family_rewards_shop
for each row execute function public.kb_touch_updated_at();

create index if not exists family_wallets_user_idx on public.family_wallets(user_id);
create index if not exists family_rewards_shop_user_available_idx on public.family_rewards_shop(user_id, is_available);
create index if not exists family_transactions_wallet_created_idx on public.family_transactions(wallet_id, created_at desc);
create index if not exists family_reward_requests_user_status_idx on public.family_reward_requests(user_id, status);
create index if not exists family_reward_requests_wallet_status_idx on public.family_reward_requests(wallet_id, status);
create unique index if not exists family_reward_requests_pending_unique_idx
on public.family_reward_requests(user_id, wallet_id, reward_id)
where status = 'pending' and reward_id is not null;
