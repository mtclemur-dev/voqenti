-- KlarBudget migration: Jurnal munca / Absenta.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabele cu prefix kb_.

create table if not exists public.kb_work_absences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null default current_date,
  start_time time not null,
  end_time time,
  duration_minutes integer check (duration_minutes is null or duration_minutes >= 0),
  location text,
  object_name text,
  work_reason text,
  kilometers numeric(10,2),
  break_minutes integer not null default 0 check (break_minutes >= 0),
  entry_source text not null default 'manual' check (entry_source in ('manual', 'automatic')),
  is_active boolean not null default false,
  eligible_over_8h boolean not null default false,
  estimated_allowance numeric(12,2) not null default 0 check (estimated_allowance >= 0),
  notes text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kb_work_absences enable row level security;

drop policy if exists "kb_work_absences_all_own" on public.kb_work_absences;
create policy "kb_work_absences_all_own" on public.kb_work_absences
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.kb_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kb_work_absences_touch_updated_at on public.kb_work_absences;
create trigger kb_work_absences_touch_updated_at before update on public.kb_work_absences
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_work_absences_user_date_idx
on public.kb_work_absences(user_id, work_date desc);

create index if not exists kb_work_absences_active_idx
on public.kb_work_absences(user_id, is_active)
where is_active = true;
