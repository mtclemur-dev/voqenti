-- KlarBudget migration: mod de plata pentru cheltuieli.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabelul kb_expenses.

alter table public.kb_expenses
add column if not exists payment_mode text not null default 'automatic_debit';

alter table public.kb_expenses
drop constraint if exists kb_expenses_payment_mode_check;

alter table public.kb_expenses
add constraint kb_expenses_payment_mode_check
check (payment_mode in ('automatic_debit', 'manual_payment', 'variable_tracking'));
