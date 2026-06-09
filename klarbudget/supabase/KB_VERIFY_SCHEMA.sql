-- KlarBudget: verificare schema Supabase (READ-ONLY)
-- Rulează în Supabase SQL Editor. Nu modifică nimic.
-- Rezultat: tabel cu status OK / LIPSĂ / ATENȚIE pentru fiecare verificare.

with checks as (
  -- ── Tabele de bază ──────────────────────────────────────────
  select 'tabel' as tip, 'kb_profiles' as obiect,
    case when to_regclass('public.kb_profiles') is not null then 'OK' else 'LIPSĂ' end as status,
    'KB_SCHEMA.sql' as migrare
  union all select 'tabel', 'kb_incomes', case when to_regclass('public.kb_incomes') is not null then 'OK' else 'LIPSĂ' end, 'KB_SCHEMA.sql'
  union all select 'tabel', 'kb_expenses', case when to_regclass('public.kb_expenses') is not null then 'OK' else 'LIPSĂ' end, 'KB_SCHEMA.sql'
  union all select 'tabel', 'kb_debts', case when to_regclass('public.kb_debts') is not null then 'OK' else 'LIPSĂ' end, 'KB_SCHEMA.sql'
  union all select 'tabel', 'kb_payment_status', case when to_regclass('public.kb_payment_status') is not null then 'OK' else 'LIPSĂ' end, 'KB_SCHEMA.sql'
  union all select 'tabel', 'kb_settings', case when to_regclass('public.kb_settings') is not null then 'OK' else 'LIPSĂ' end, 'KB_SCHEMA.sql'
  union all select 'tabel', 'kb_accounts', case when to_regclass('public.kb_accounts') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_ACCOUNTS.sql'
  union all select 'tabel', 'kb_account_snapshots', case when to_regclass('public.kb_account_snapshots') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_ACCOUNTS.sql'
  union all select 'tabel', 'kb_daily_entries', case when to_regclass('public.kb_daily_entries') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_DAILY_JOURNAL.sql'
  union all select 'tabel', 'kb_daily_closures', case when to_regclass('public.kb_daily_closures') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_DAILY_JOURNAL.sql'
  union all select 'tabel', 'kb_work_absences', case when to_regclass('public.kb_work_absences') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_WORK_ABSENCES.sql'
  union all select 'tabel', 'kb_utility_readings', case when to_regclass('public.kb_utility_readings') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_SAVINGS_AND_UTILITIES.sql'
  union all select 'tabel', 'kb_shopping_list', case when to_regclass('public.kb_shopping_list') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_SMART_SHOPPING.sql'
  union all select 'tabel', 'kb_weekly_offers', case when to_regclass('public.kb_weekly_offers') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_SMART_SHOPPING.sql'
  union all select 'tabel', 'kb_receipts', case when to_regclass('public.kb_receipts') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_SMART_SHOPPING.sql'
  union all select 'tabel', 'kb_pantry_items', case when to_regclass('public.kb_pantry_items') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_PANTRY.sql'
  union all select 'tabel', 'kb_family_members', case when to_regclass('public.kb_family_members') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_FAMILY_MEMBERS.sql'
  union all select 'tabel', 'family_wallets', case when to_regclass('public.family_wallets') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_FAMILY_TOKEN_ECONOMY.sql'
  union all select 'tabel', 'kb_kid_tasks', case when to_regclass('public.kb_kid_tasks') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_FAMILY_CHILD_LINKS.sql'
  union all select 'tabel', 'kb_family_messages', case when to_regclass('public.kb_family_messages') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_FAMILY_CHAT.sql'
  union all select 'tabel', 'kb_family_settings', case when to_regclass('public.kb_family_settings') is not null then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_FAMILY_COIN_SETTINGS.sql'

  -- ── Coloane critice pe kb_settings ──────────────────────────
  union all select 'coloană', 'kb_settings.trash_schedule',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_settings' and column_name = 'trash_schedule'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_TRASH_WEEKEND.sql'
  union all select 'coloană', 'kb_settings.weekend_ideas',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_settings' and column_name = 'weekend_ideas'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_TRASH_WEEKEND.sql'
  union all select 'coloană', 'kb_settings.minimum_reserve',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_settings' and column_name = 'minimum_reserve'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_ACCOUNTS.sql'
  union all select 'coloană', 'kb_settings.utility_price_electricity',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_settings' and column_name = 'utility_price_electricity'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_SAVINGS_AND_UTILITIES.sql'

  -- ── Coloane profil / jurnal ─────────────────────────────────
  union all select 'coloană', 'kb_profiles.account_role',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_profiles' and column_name = 'account_role'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_PROFILE_ACCOUNT_ROLE.sql'
  union all select 'coloană', 'kb_daily_entries.priority',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_daily_entries' and column_name = 'priority'
    ) then 'OK' else 'LIPSĂ' end, 'KB_FIX_PRIORITY_DAILY_ENTRIES.sql'
  union all select 'coloană', 'kb_daily_entries.entry_mode',
    case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'kb_daily_entries' and column_name = 'entry_mode'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_DAILY_JOURNAL_QUICK_MODE.sql'

  -- ── RLS activat ─────────────────────────────────────────────
  union all select 'rls', 'kb_pantry_items',
    case when exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'kb_pantry_items' and c.relrowsecurity
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_PANTRY.sql'
  union all select 'rls', 'kb_family_members',
    case when exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'kb_family_members' and c.relrowsecurity
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_FAMILY_MEMBERS.sql'

  -- ── Politici familie (critice) ──────────────────────────────
  union all select 'policy', 'kb_pantry_items_family_member_read',
    case when exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'kb_pantry_items'
        and policyname = 'kb_pantry_items_family_member_read'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_PANTRY_FAMILY_RLS.sql'
  union all select 'policy', 'kb_pantry_items_family_member_write',
    case when exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'kb_pantry_items'
        and policyname = 'kb_pantry_items_family_member_write'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_PANTRY_FAMILY_RLS.sql'
  union all select 'policy', 'kb_incomes_family_member_read',
    case when exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'kb_incomes'
        and policyname = 'kb_incomes_family_member_read'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_FAMILY_MEMBERS.sql'
  union all select 'policy', 'kb_settings_family_member_write',
    case when exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = 'kb_settings'
        and policyname = 'kb_settings_family_member_write'
    ) then 'OK' else 'LIPSĂ' end, 'KB_MIGRATION_FAMILY_MEMBERS.sql'

  -- ── Date familie (opțional, dar util) ───────────────────────
  union all select 'date', 'kb_family_members (>= 2 activi)',
    case when (select count(*) from public.kb_family_members where active = true) >= 2
      then 'OK' else 'ATENȚIE' end, 'KB_MIGRATION_FAMILY_MEMBERS.sql + KB_FIX_CHILD_ACCOUNTS.sql'
)
select
  tip,
  obiect,
  status,
  migrare,
  case
    when status = 'OK' then '—'
    when status = 'ATENȚIE' then 'Verifică manual membrii familiei / copiii'
    else 'Rulează migrarea indicată'
  end as actiune
from checks
order by
  case status when 'LIPSĂ' then 0 when 'ATENȚIE' then 1 else 2 end,
  tip,
  obiect;

-- Rezumat rapid (rulează separat sau citește ultimul rând din rezultatul de mai sus):
-- select status, count(*) from checks group by status order by status;
