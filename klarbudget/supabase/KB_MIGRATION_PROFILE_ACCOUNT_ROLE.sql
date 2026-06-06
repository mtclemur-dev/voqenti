-- KlarBudget migration: rol cont parinte/copil.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabelul kb_profiles.

alter table public.kb_profiles
add column if not exists account_role text not null default 'parent';

alter table public.kb_profiles
drop constraint if exists kb_profiles_account_role_check;

alter table public.kb_profiles
add constraint kb_profiles_account_role_check
check (account_role in ('parent', 'child'));
