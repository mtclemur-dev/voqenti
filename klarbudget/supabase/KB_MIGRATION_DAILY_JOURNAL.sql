-- KlarBudget migration: Jurnal zilnic pentru cheltuieli reale.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabele cu prefix kb_.

create table if not exists public.kb_daily_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entry_date date not null default current_date,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  category text not null default 'altele',
  store text,
  person text not null default 'family' check (person in ('victor', 'doina', 'family')),
  product_name text,
  quantity numeric(12,3),
  unit text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_daily_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  closure_date date not null default current_date,
  total_amount numeric(12,2) not null default 0,
  entry_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, closure_date)
);

alter table public.kb_daily_entries enable row level security;
alter table public.kb_daily_closures enable row level security;

drop policy if exists "kb_daily_entries_all_own" on public.kb_daily_entries;
create policy "kb_daily_entries_all_own" on public.kb_daily_entries
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_daily_closures_all_own" on public.kb_daily_closures;
create policy "kb_daily_closures_all_own" on public.kb_daily_closures
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.kb_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kb_daily_entries_touch_updated_at on public.kb_daily_entries;
create trigger kb_daily_entries_touch_updated_at before update on public.kb_daily_entries
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_daily_closures_touch_updated_at on public.kb_daily_closures;
create trigger kb_daily_closures_touch_updated_at before update on public.kb_daily_closures
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_daily_entries_user_date_idx on public.kb_daily_entries(user_id, entry_date desc);
create index if not exists kb_daily_entries_product_idx on public.kb_daily_entries(user_id, lower(product_name));
