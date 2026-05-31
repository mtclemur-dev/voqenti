-- KlarBudget migration: categorii datorii, status plati si optiune credit casa.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabele cu prefix kb_.

alter table public.kb_debts
add column if not exists debt_category text not null default 'dispo';

alter table public.kb_debts
drop constraint if exists kb_debts_status_check;

alter table public.kb_debts
add constraint kb_debts_status_check
check (status in ('active', 'paid', 'paused'));

alter table public.kb_settings
add column if not exists include_mortgage_in_plan boolean not null default false;

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

alter table public.kb_payment_status enable row level security;

drop policy if exists "kb_payment_status_all_own" on public.kb_payment_status;
create policy "kb_payment_status_all_own" on public.kb_payment_status
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.kb_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kb_payment_status_touch_updated_at on public.kb_payment_status;
create trigger kb_payment_status_touch_updated_at before update on public.kb_payment_status
for each row execute function public.kb_touch_updated_at();
