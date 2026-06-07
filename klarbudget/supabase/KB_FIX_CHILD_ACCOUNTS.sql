-- ============================================================
-- KlarBudget: FIX Conturi Copii (Veronica & Robert)
-- Rulează în Supabase SQL Editor
-- ============================================================
-- Problemă: copiii nu sunt în kb_family_members →
-- nu pot scrie chat/cereri și datele lor nu apar la părinți.
-- ============================================================

-- PASUL 1: Inserează copiii în kb_family_members
-- (Înlocuiește emailurile copiilor cu cele reale din auth.users)

-- Veronica
INSERT INTO public.kb_family_members (
  user_id,
  family_owner_user_id,
  email,
  display_name,
  role,
  family_role,
  default_view,
  can_edit_finances,
  can_manage_children,
  active
)
SELECT
  child_user.id,
  victor.id,
  lower(child_user.email),
  'Veronica',
  'child',
  'daughter',
  'kid_mode',
  false,
  false,
  true
FROM auth.users child_user
CROSS JOIN auth.users victor
WHERE lower(victor.email) = 'mtclemur@gmail.com'
  AND lower(child_user.email) = 'mtclemur@gmx.de'
ON CONFLICT (email) DO UPDATE
  SET user_id = excluded.user_id,
      family_owner_user_id = excluded.family_owner_user_id,
      display_name = excluded.display_name,
      role = 'child',
      family_role = 'daughter',
      default_view = 'kid_mode',
      can_edit_finances = false,
      can_manage_children = false,
      active = true;

-- Robert
INSERT INTO public.kb_family_members (
  user_id,
  family_owner_user_id,
  email,
  display_name,
  role,
  family_role,
  default_view,
  can_edit_finances,
  can_manage_children,
  active
)
SELECT
  child_user.id,
  victor.id,
  lower(child_user.email),
  'Robert',
  'child',
  'son',
  'kid_mode',
  false,
  false,
  true
FROM auth.users child_user
CROSS JOIN auth.users victor
WHERE lower(victor.email) = 'mtclemur@gmail.com'
  AND lower(child_user.email) = 'victorkraft69@gmail.com'
ON CONFLICT (email) DO UPDATE
  SET user_id = excluded.user_id,
      family_owner_user_id = excluded.family_owner_user_id,
      display_name = excluded.display_name,
      role = 'child',
      family_role = 'son',
      default_view = 'kid_mode',
      can_edit_finances = false,
      can_manage_children = false,
      active = true;

-- ============================================================
-- PASUL 2: Politici RLS care permit copiilor să SCRIE în
-- tabelele Kids (chat, cereri, wallets) cu user_id = owner-ului familiei
-- ============================================================

-- Permite copiilor să scrie în kb_family_messages
DROP POLICY IF EXISTS "kb_family_messages_child_write" ON public.kb_family_messages;
CREATE POLICY "kb_family_messages_child_write" ON public.kb_family_messages
FOR INSERT WITH CHECK (
  exists (
    select 1
    from public.kb_family_members member
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.active = true
      and member.role = 'child'
      and member.family_owner_user_id = kb_family_messages.user_id
  )
);

-- Permite copiilor să citească mesajele familiei lor
DROP POLICY IF EXISTS "kb_family_messages_child_read" ON public.kb_family_messages;
CREATE POLICY "kb_family_messages_child_read" ON public.kb_family_messages
FOR SELECT USING (
  exists (
    select 1
    from public.kb_family_members member
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.active = true
      and member.role = 'child'
      and member.family_owner_user_id = kb_family_messages.user_id
  )
);

-- Permite copiilor să scrie cereri (kb_kid_requests)
DROP POLICY IF EXISTS "kb_kid_requests_child_write" ON public.kb_kid_requests;
CREATE POLICY "kb_kid_requests_child_write" ON public.kb_kid_requests
FOR INSERT WITH CHECK (
  exists (
    select 1
    from public.kb_family_members member
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.active = true
      and member.role = 'child'
      and member.family_owner_user_id = kb_kid_requests.user_id
  )
);

-- Permite copiilor să citească propriile cereri
DROP POLICY IF EXISTS "kb_kid_requests_child_read" ON public.kb_kid_requests;
CREATE POLICY "kb_kid_requests_child_read" ON public.kb_kid_requests
FOR SELECT USING (
  exists (
    select 1
    from public.kb_family_members member
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.active = true
      and member.role = 'child'
      and member.family_owner_user_id = kb_kid_requests.user_id
  )
);

-- Permite copiilor să citească propriul wallet
DROP POLICY IF EXISTS "family_wallets_child_read" ON public.family_wallets;
CREATE POLICY "family_wallets_child_read" ON public.family_wallets
FOR SELECT USING (
  exists (
    select 1
    from public.kb_family_members member
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.active = true
      and member.role = 'child'
      and member.family_owner_user_id = family_wallets.user_id
  )
);

-- Permite copiilor să citească sarcini
DROP POLICY IF EXISTS "kb_kid_tasks_child_read" ON public.kb_kid_tasks;
CREATE POLICY "kb_kid_tasks_child_read" ON public.kb_kid_tasks
FOR SELECT USING (
  exists (
    select 1
    from public.kb_family_members member
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.active = true
      and member.role = 'child'
      and member.family_owner_user_id = kb_kid_tasks.user_id
  )
);

-- Permite copiilor să citească recompensele
DROP POLICY IF EXISTS "family_rewards_shop_child_read" ON public.family_rewards_shop;
CREATE POLICY "family_rewards_shop_child_read" ON public.family_rewards_shop
FOR SELECT USING (
  exists (
    select 1
    from public.kb_family_members member
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.active = true
      and member.role = 'child'
      and member.family_owner_user_id = family_rewards_shop.user_id
  )
);

-- Permite copiilor să citească setările familiei (coinValue etc.)
DROP POLICY IF EXISTS "kb_family_settings_child_read" ON public.kb_family_settings;
CREATE POLICY "kb_family_settings_child_read" ON public.kb_family_settings
FOR SELECT USING (
  exists (
    select 1
    from public.kb_family_members member
    where lower(member.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and member.active = true
      and member.role = 'child'
      and member.family_owner_user_id = kb_family_settings.user_id
  )
);

-- ============================================================
-- PASUL 3: Verificare - ce apare în kb_family_members
-- ============================================================
SELECT
  member.display_name,
  member.email,
  member.role,
  member.family_role,
  member.default_view,
  member.active,
  owner.email as owner_email
FROM public.kb_family_members member
LEFT JOIN auth.users owner ON owner.id = member.family_owner_user_id
ORDER BY member.created_at;

-- ============================================================
-- PASUL 4: Verificare emailuri existente în auth.users
-- (ca să știi ce emailuri să pui sus la copii)
-- ============================================================
SELECT id, email, raw_user_meta_data->>'account_role' as role,
       raw_user_meta_data->>'child_name' as child_name
FROM auth.users
ORDER BY created_at;
