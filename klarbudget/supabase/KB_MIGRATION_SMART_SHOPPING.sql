-- KlarBudget migration: Cumparaturi inteligente / Oferte.
-- Ruleaza in Supabase SQL Editor. Atinge doar tabele cu prefix kb_.

create table if not exists public.kb_shopping_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_name text not null,
  category text,
  desired_quantity numeric(12,3),
  unit text,
  priority text not null default 'normal' check (priority in ('normal', 'important', 'offer_only')),
  preferred_store text,
  purchased boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_weekly_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null,
  product_name text not null,
  brand text,
  category text,
  price numeric(12,2) not null check (price >= 0),
  old_price numeric(12,2),
  discount_percent numeric(6,2),
  quantity numeric(12,3),
  unit text,
  unit_price numeric(12,4),
  valid_from date,
  valid_until date,
  source text not null default 'manual_text' check (source in ('manual_text', 'pdf_upload', 'manual')),
  source_file_name text,
  source_page integer,
  app_price boolean not null default false,
  confidence numeric(5,2) not null default 0.70,
  status text not null default 'confirmed' check (status in ('pending', 'confirmed', 'ignored', 'needs_review')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.kb_stores (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  distance_km numeric(10,2),
  fuel_cost_estimate numeric(10,2),
  on_regular_route boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, name)
);

create table if not exists public.kb_offer_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_name text not null,
  source_url text,
  active boolean not null default false,
  import_mode text not null default 'manual_pdf' check (import_mode in ('manual_pdf', 'manual_text', 'link_experimental', 'auto_future')),
  last_checked_at timestamptz,
  status text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.kb_shopping_list enable row level security;
alter table public.kb_weekly_offers enable row level security;
alter table public.kb_stores enable row level security;
alter table public.kb_offer_sources enable row level security;

drop policy if exists "kb_shopping_list_all_own" on public.kb_shopping_list;
create policy "kb_shopping_list_all_own" on public.kb_shopping_list
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_weekly_offers_all_own" on public.kb_weekly_offers;
create policy "kb_weekly_offers_all_own" on public.kb_weekly_offers
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_stores_all_own" on public.kb_stores;
create policy "kb_stores_all_own" on public.kb_stores
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "kb_offer_sources_all_own" on public.kb_offer_sources;
create policy "kb_offer_sources_all_own" on public.kb_offer_sources
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.kb_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists kb_shopping_list_touch_updated_at on public.kb_shopping_list;
create trigger kb_shopping_list_touch_updated_at before update on public.kb_shopping_list
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_weekly_offers_touch_updated_at on public.kb_weekly_offers;
create trigger kb_weekly_offers_touch_updated_at before update on public.kb_weekly_offers
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_stores_touch_updated_at on public.kb_stores;
create trigger kb_stores_touch_updated_at before update on public.kb_stores
for each row execute function public.kb_touch_updated_at();

drop trigger if exists kb_offer_sources_touch_updated_at on public.kb_offer_sources;
create trigger kb_offer_sources_touch_updated_at before update on public.kb_offer_sources
for each row execute function public.kb_touch_updated_at();

create index if not exists kb_weekly_offers_user_valid_idx on public.kb_weekly_offers(user_id, valid_until desc);
create index if not exists kb_weekly_offers_product_idx on public.kb_weekly_offers(user_id, lower(product_name));
create index if not exists kb_shopping_list_user_product_idx on public.kb_shopping_list(user_id, lower(product_name));
