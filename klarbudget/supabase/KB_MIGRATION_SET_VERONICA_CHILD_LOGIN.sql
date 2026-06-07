-- KlarBudget migration: marcheaza emailul mtclemur@gmx.de ca profil copil Veronica.
-- Ruleaza in Supabase SQL Editor daca vrei ca rolul sa fie corect si in baza de date.
-- Nu sterge date. Actualizeaza/creeaza doar profilul pentru utilizatorul existent din auth.users.

insert into public.kb_profiles (id, preferred_language, currency, account_role)
select id, 'ro', 'EUR', 'child'
from auth.users
where lower(email) = 'mtclemur@gmx.de'
on conflict (id) do update
set account_role = 'child';

