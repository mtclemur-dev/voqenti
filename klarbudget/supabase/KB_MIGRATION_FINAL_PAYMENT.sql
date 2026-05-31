-- KlarBudget migration: rata finala / Schlussrate pentru datorii.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabelul kb_debts.

alter table public.kb_debts
add column if not exists final_payment numeric(12,2) not null default 0 check (final_payment >= 0);
