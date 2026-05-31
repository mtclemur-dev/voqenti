-- KlarBudget migration: separa platile fixe, bugetele variabile si cheltuielile unice.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabelul kb_expenses.

alter table public.kb_expenses
add column if not exists expense_kind text not null default 'fixed_payment';

alter table public.kb_expenses
drop constraint if exists kb_expenses_expense_kind_check;

alter table public.kb_expenses
add constraint kb_expenses_expense_kind_check
check (expense_kind in ('fixed_payment', 'variable_budget', 'one_time_expense'));

-- Clasificare initiala pentru datele existente.
-- Ajusteaza manual dupa nevoie daca unele cheltuieli au fost introduse diferit.

update public.kb_expenses
set expense_kind = 'variable_budget',
    expense_type = 'variable',
    payment_mode = 'variable_tracking',
    frequency = 'monthly',
    due_date = null
where lower(name) similar to '%(mancare|mâncare|motorina|motorină|haine|copii|sanatate|sănătate|timp liber)%'
   or lower(category) similar to '%(mancare|mâncare|haine|copii|sanatate|sănătate|timp liber|casa / reparatii|casă / reparații)%';

update public.kb_expenses
set expense_kind = 'one_time_expense',
    frequency = 'once',
    expense_type = 'variable',
    payment_mode = 'manual_payment'
where frequency = 'once'
   or lower(name) similar to '%(luftentfeuchter|zalando|reparatie|reparație|piesa|piesă)%';

update public.kb_expenses
set expense_kind = 'fixed_payment',
    expense_type = 'fixed',
    payment_mode = case when payment_mode = 'variable_tracking' then 'automatic_debit' else payment_mode end
where expense_kind not in ('variable_budget', 'one_time_expense')
  and (
    lower(name) similar to '%(telekom|gaz|gas|curent|strom|netflix|disney|gradinita|grădiniță|asigurare|radio|impozit|abo|abonament)%'
    or expense_type = 'fixed'
  );
