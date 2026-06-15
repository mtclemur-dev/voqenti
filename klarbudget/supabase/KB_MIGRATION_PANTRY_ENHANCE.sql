-- KlarBudget: Migrare îmbunătățiri Debara / Rezervă
-- Fișier: KB_MIGRATION_PANTRY_ENHANCE.sql
-- Data: 2026-06-15
--
-- Scriptul este IDEMPOTENT (safe de rulat de mai multe ori).
-- Rulează în Supabase SQL Editor.
-- NU modifică tabelul kb_pantry_items existent structural.
-- NU șterge date.
-- NU modifică RLS.
-- NU creează tabele noi.
-- Adaugă DOAR 2 coloane opționale noi.
-- ============================================================

-- ============================================================
-- 1. Coloană: important_for_reserve
--    Bifează produsele esențiale pentru rezerva familiei.
-- ============================================================
ALTER TABLE public.kb_pantry_items
  ADD COLUMN IF NOT EXISTS important_for_reserve BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- 2. Coloană: search_keywords
--    Cuvinte cheie de căutare / aliasuri (ex: "cafea, Kaffee").
--    Folosit pentru matching cu ofertele de la magazine.
-- ============================================================
ALTER TABLE public.kb_pantry_items
  ADD COLUMN IF NOT EXISTS search_keywords TEXT;

-- ============================================================
-- GATA.
-- Câmpuri noi adăugate la kb_pantry_items:
--   important_for_reserve BOOLEAN DEFAULT false
--   search_keywords        TEXT (opțional)
--
-- Câmpuri existente NEMODIFICATE:
--   id, user_id, name, category, quantity, min_quantity,
--   unit, expiry_date, preferred_store, notes,
--   buy_on_offer, active, created_at, updated_at
--
-- RLS: NEMODIFICAT
-- ============================================================
