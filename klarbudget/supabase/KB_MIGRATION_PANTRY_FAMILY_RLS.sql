-- KlarBudget: RLS familie pentru Debara (kb_pantry_items)
-- Rulează în Supabase SQL Editor după KB_MIGRATION_PANTRY.sql și KB_MIGRATION_FAMILY_MEMBERS.sql.
-- Idempotent: poate fi rulat de mai multe ori.

do $$
begin
  if to_regclass('public.kb_pantry_items') is null then
    raise notice 'Tabelul kb_pantry_items nu există. Rulează mai întâi KB_MIGRATION_PANTRY.sql.';
    return;
  end if;

  execute 'drop policy if exists "kb_pantry_items_family_member_read" on public.kb_pantry_items';
  execute '
    create policy "kb_pantry_items_family_member_read" on public.kb_pantry_items
    for select using (
      exists (
        select 1
        from public.kb_family_members member
        where lower(member.email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
          and member.active = true
          and member.family_owner_user_id = kb_pantry_items.user_id
          and member.can_edit_finances = true
      )
    )';

  execute 'drop policy if exists "kb_pantry_items_family_member_write" on public.kb_pantry_items';
  execute '
    create policy "kb_pantry_items_family_member_write" on public.kb_pantry_items
    for all using (
      exists (
        select 1
        from public.kb_family_members member
        where lower(member.email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
          and member.active = true
          and member.family_owner_user_id = kb_pantry_items.user_id
          and member.can_edit_finances = true
      )
    ) with check (
      exists (
        select 1
        from public.kb_family_members member
        where lower(member.email) = lower(coalesce(auth.jwt() ->> ''email'', ''''))
          and member.active = true
          and member.family_owner_user_id = kb_pantry_items.user_id
          and member.can_edit_finances = true
      )
    )';
end $$;
