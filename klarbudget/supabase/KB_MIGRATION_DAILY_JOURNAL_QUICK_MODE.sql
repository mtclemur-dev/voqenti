-- KlarBudget migration: mod rapid/detaliat si pret pe unitate pentru Jurnal zilnic.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabelul kb_daily_entries.

alter table public.kb_daily_entries
add column if not exists entry_mode text not null default 'quick';

alter table public.kb_daily_entries
drop constraint if exists kb_daily_entries_entry_mode_check;

alter table public.kb_daily_entries
add constraint kb_daily_entries_entry_mode_check
check (entry_mode in ('quick', 'detailed'));

alter table public.kb_daily_entries
add column if not exists unit_price numeric(12,4);
