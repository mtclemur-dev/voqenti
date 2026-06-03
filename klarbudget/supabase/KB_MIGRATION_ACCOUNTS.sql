-- KlarBudget migration: Conturi & Solduri.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabele cu prefix kb_.

create table if not exists public.kb_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_type text not null default 'checking'
    check (account_type in ('checking', 'cash', 'paypal', 'savings', 'trade_republic', 'child_account', 'credit_card', 'dispo', 'other')),
  current_balance numeric(12,2) not null default 0,
  currency text not null default 'EUR',
  include_in_safe_balance boolean not null default true,
  has_overdraft boolean not null default false,
  overdraft_limit numeric(12,2) not null default 0 check (overdraft_limit >= 0),
  overdraft_interest numeric(6,3) check (overdraft_interest is null or overdraft_interest >= 0),
  notes text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.kb_account_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.kb_accounts(id) on delete cascade,
  balance numeric(12,2) not null,
  snapshot_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table public.kb_accounts enable row level security;
alter table public.kb_account_snapshots enable row level security;

drop policy if exists "kb_accounts_all_own" on public.kb_accounts;
create policy "kb_accounts_all_own" on public.kb_accounts
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_account_snapshots_all_own" on public.kb_account_snapshots;
create policy "kb_account_snapshots_all_own" on public.kb_account_snapshots
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.kb_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kb_accounts_touch_updated_at on public.kb_accounts;
create trigger kb_accounts_touch_updated_at before update on public.kb_accounts
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_accounts_user_id_idx on public.kb_accounts(user_id);
create index if not exists kb_account_snapshots_account_date_idx on public.kb_account_snapshots(account_id, snapshot_date desc);

alter table public.kb_settings
add column if not exists minimum_reserve numeric(12,2) not null default 200 check (minimum_reserve >= 0);

alter table public.kb_settings
add column if not exists salary_day_victor integer check (salary_day_victor is null or (salary_day_victor >= 1 and salary_day_victor <= 31));

alter table public.kb_settings
add column if not exists salary_day_doina integer check (salary_day_doina is null or (salary_day_doina >= 1 and salary_day_doina <= 31));

alter table public.kb_settings
add column if not exists include_overdraft_in_debt_plan boolean not null default false;
