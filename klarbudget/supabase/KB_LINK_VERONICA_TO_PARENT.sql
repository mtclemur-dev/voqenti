-- KlarBudget: leaga contul copil Veronica de contul parintelui.
-- Ruleaza in Supabase SQL Editor DUPA KB_MIGRATION_FAMILY_CHILD_LINKS.sql.
--
-- IMPORTANT:
-- 1. Inlocuieste valoarea de la parent_email cu emailul real al contului parinte.
-- 2. Copilul este mtclemur@gmx.de si va vedea doar portofelul Veronica.
-- 3. Nu sterge date. Creeaza/actualizeaza doar legatura copil -> parinte.

do $$
declare
  parent_email text := 'mtclemur@gmail.com';
  child_email text := 'mtclemur@gmx.de';
  parent_id uuid;
  child_id uuid;
begin
  if parent_email = 'EMAIL_PARINTE_AICI' then
    raise exception 'Inlocuieste EMAIL_PARINTE_AICI cu emailul real al contului parinte.';
  end if;

  select id into parent_id
  from auth.users
  where lower(email) = lower(parent_email)
  limit 1;

  if parent_id is null then
    raise exception 'Nu exista cont parinte cu emailul: %', parent_email;
  end if;

  select id into child_id
  from auth.users
  where lower(email) = lower(child_email)
  limit 1;

  if child_id is null then
    raise exception 'Nu exista cont copil cu emailul: %', child_email;
  end if;

  insert into public.kb_profiles (id, preferred_language, currency, account_role)
  values (child_id, 'ro', 'EUR', 'child')
  on conflict (id) do update
  set account_role = 'child';

  insert into public.family_wallets (user_id, member_name, balance)
  values (parent_id, 'Veronica', 0)
  on conflict (user_id, member_name) do nothing;

  insert into public.kb_family_child_links (parent_user_id, child_user_id, child_name, active)
  values (parent_id, child_id, 'Veronica', true)
  on conflict (child_user_id) do update
  set parent_user_id = excluded.parent_user_id,
      child_name = excluded.child_name,
      active = true;
end $$;

-- Verificare dupa rulare: trebuie sa apara 1 rand cu child_name = Veronica.
select
  link.child_name,
  link.active,
  parent.email as parent_email,
  child.email as child_email
from public.kb_family_child_links link
join auth.users parent on parent.id = link.parent_user_id
join auth.users child on child.id = link.child_user_id
where lower(child.email) = lower('mtclemur@gmx.de');

-- Daca vrei sa vezi ce emailuri exista in Auth:
-- select email, id, created_at from auth.users order by created_at desc;
