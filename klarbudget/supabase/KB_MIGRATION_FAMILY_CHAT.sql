-- KlarBudget migration: Chat familie in modulul Copii.
-- Ruleaza in Supabase SQL Editor.
-- Nu adauga meniu principal nou. Datele raman izolate pe familia parintelui.

create table if not exists public.kb_family_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid,
  sender_name text not null,
  sender_role text not null default 'parent'
    check (sender_role in ('parent', 'child', 'system')),
  child_id uuid references public.family_wallets(id) on delete set null,
  message_text text not null,
  message_type text not null default 'normal'
    check (message_type in ('normal', 'system', 'task_request', 'reward_request')),
  related_task_id uuid references public.kb_kid_tasks(id) on delete set null,
  related_reward_id uuid references public.family_rewards_shop(id) on delete set null,
  related_request_id uuid references public.kb_kid_requests(id) on delete set null,
  read_by jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kb_family_messages enable row level security;

drop policy if exists "kb_family_messages_parent_all" on public.kb_family_messages;
create policy "kb_family_messages_parent_all" on public.kb_family_messages
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_family_messages_child_read" on public.kb_family_messages;
create policy "kb_family_messages_child_read" on public.kb_family_messages
for select using (
  exists (
    select 1
    from public.kb_family_child_links link
    where link.child_user_id = auth.uid()
      and link.parent_user_id = kb_family_messages.user_id
      and link.active = true
  )
);

drop policy if exists "kb_family_messages_child_insert" on public.kb_family_messages;
create policy "kb_family_messages_child_insert" on public.kb_family_messages
for insert with check (
  exists (
    select 1
    from public.kb_family_child_links link
    join public.family_wallets wallet
      on wallet.user_id = link.parent_user_id
     and lower(wallet.member_name) = lower(link.child_name)
    where link.child_user_id = auth.uid()
      and link.parent_user_id = kb_family_messages.user_id
      and link.active = true
      and kb_family_messages.child_id = wallet.id
      and kb_family_messages.sender_role in ('child', 'system')
      and kb_family_messages.message_type in ('normal', 'system', 'task_request', 'reward_request')
  )
);

drop trigger if exists kb_family_messages_touch_updated_at on public.kb_family_messages;
create trigger kb_family_messages_touch_updated_at before update on public.kb_family_messages
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_family_messages_user_created_idx
on public.kb_family_messages(user_id, created_at desc);

create index if not exists kb_family_messages_child_created_idx
on public.kb_family_messages(child_id, created_at desc);
