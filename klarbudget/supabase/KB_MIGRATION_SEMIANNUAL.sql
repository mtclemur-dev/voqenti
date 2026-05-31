-- KlarBudget migration: permite frecventa la 6 luni.
-- Ruleaza in Supabase SQL Editor daca tabelele kb_ exista deja.

alter table public.kb_incomes
drop constraint if exists kb_incomes_frequency_check;

alter table public.kb_incomes
add constraint kb_incomes_frequency_check
check (frequency in ('monthly', 'quarterly', 'semiannual', 'yearly', 'once'));

alter table public.kb_expenses
drop constraint if exists kb_expenses_frequency_check;

alter table public.kb_expenses
add constraint kb_expenses_frequency_check
check (frequency in ('monthly', 'quarterly', 'semiannual', 'yearly', 'once'));
