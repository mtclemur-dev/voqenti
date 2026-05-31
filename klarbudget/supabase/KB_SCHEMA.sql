-- KlarBudget Supabase schema
-- Ruleaza acest script in Supabase SQL Editor. Nu modifica tabelele vechi.

create extension if not exists pgcrypto;

create table if not exists public.kb_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  preferred_language text not null default 'ro' check (preferred_language in ('ro', 'de')),
  currency text not null default 'EUR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_incomes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'semiannual', 'yearly', 'once')),
  occurrence_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  category text not null,
  amount numeric(12,2) not null check (amount >= 0),
  frequency text not null check (frequency in ('monthly', 'quarterly', 'semiannual', 'yearly', 'once')),
  due_date date,
  expense_kind text not null default 'fixed_payment' check (expense_kind in ('fixed_payment', 'variable_budget', 'one_time_expense')),
  expense_type text not null check (expense_type in ('fixed', 'variable')),
  payment_mode text not null default 'automatic_debit' check (payment_mode in ('automatic_debit', 'manual_payment', 'variable_tracking')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  debt_category text not null default 'dispo',
  initial_amount numeric(12,2) not null check (initial_amount >= 0),
  remaining_balance numeric(12,2) not null check (remaining_balance >= 0),
  final_payment numeric(12,2) not null default 0 check (final_payment >= 0),
  monthly_payment numeric(12,2) not null default 0 check (monthly_payment >= 0),
  interest_rate numeric(6,3) check (interest_rate is null or interest_rate >= 0),
  estimated_end_date date,
  priority integer not null default 3,
  status text not null default 'active' check (status in ('active', 'paid', 'paused')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  debt_id uuid references public.kb_debts(id) on delete set null,
  expense_id uuid references public.kb_expenses(id) on delete set null,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  payment_date date not null default current_date,
  payment_type text not null default 'expense' check (payment_type in ('income', 'expense', 'debt')),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.kb_payment_status (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expense_id uuid references public.kb_expenses(id) on delete cascade,
  debt_id uuid references public.kb_debts(id) on delete set null,
  name text not null,
  amount numeric(12,2) not null check (amount >= 0),
  due_date date not null,
  paid_date date,
  status text not null default 'pending' check (status in ('pending', 'paid', 'postponed')),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, expense_id, due_date)
);

create table if not exists public.kb_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  monthly_extra_debt_payment numeric(12,2) not null default 0 check (monthly_extra_debt_payment >= 0),
  debt_method text not null default 'snowball' check (debt_method in ('snowball', 'avalanche')),
  include_mortgage_in_plan boolean not null default false,
  large_payment_threshold numeric(12,2) not null default 300,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id)
);

alter table public.kb_profiles enable row level security;
alter table public.kb_incomes enable row level security;
alter table public.kb_expenses enable row level security;
alter table public.kb_debts enable row level security;
alter table public.kb_payments enable row level security;
alter table public.kb_payment_status enable row level security;
alter table public.kb_settings enable row level security;

create policy "kb_profiles_select_own" on public.kb_profiles for select using (auth.uid() = id);
create policy "kb_profiles_insert_own" on public.kb_profiles for insert with check (auth.uid() = id);
create policy "kb_profiles_update_own" on public.kb_profiles for update using (auth.uid() = id);

create policy "kb_incomes_all_own" on public.kb_incomes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kb_expenses_all_own" on public.kb_expenses for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kb_debts_all_own" on public.kb_debts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kb_payments_all_own" on public.kb_payments for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kb_payment_status_all_own" on public.kb_payment_status for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "kb_settings_all_own" on public.kb_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.kb_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kb_profiles_touch_updated_at on public.kb_profiles;
create trigger kb_profiles_touch_updated_at before update on public.kb_profiles
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_incomes_touch_updated_at on public.kb_incomes;
create trigger kb_incomes_touch_updated_at before update on public.kb_incomes
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_expenses_touch_updated_at on public.kb_expenses;
create trigger kb_expenses_touch_updated_at before update on public.kb_expenses
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_debts_touch_updated_at on public.kb_debts;
create trigger kb_debts_touch_updated_at before update on public.kb_debts
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_settings_touch_updated_at on public.kb_settings;
create trigger kb_settings_touch_updated_at before update on public.kb_settings
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_payment_status_touch_updated_at on public.kb_payment_status;
create trigger kb_payment_status_touch_updated_at before update on public.kb_payment_status
for each row execute function public.kb_touch_updated_at();
