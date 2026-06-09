-- KlarBudget: Migrare modul Debara / Rezervă
-- Tabel: kb_pantry_items
-- Data: 2026-06-09
--
-- Scriptul este IDEMPOTENT (safe de rulat de mai multe ori).
-- Rulează în Supabase SQL Editor.
-- Nu modifică niciun tabel existent.

-- ============================================================
-- 1. Creare tabel (doar dacă nu există)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.kb_pantry_items (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  category     text        NOT NULL DEFAULT 'Altele',
  quantity     numeric     NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_quantity numeric     NOT NULL DEFAULT 1 CHECK (min_quantity >= 0),
  unit         text        NOT NULL DEFAULT 'buc',
  expiry_date  date,
  preferred_store text,
  notes        text,
  buy_on_offer boolean     NOT NULL DEFAULT false,
  active       boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 2. Activare Row Level Security
-- ============================================================

ALTER TABLE public.kb_pantry_items ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. Politici RLS (idempotente cu DO block)
-- ============================================================

DO $$
BEGIN
  -- SELECT: utilizatorul vede doar propriile produse
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'kb_pantry_items'
      AND policyname = 'kb_pantry_items_all_own'
  ) THEN
    CREATE POLICY kb_pantry_items_all_own
      ON public.kb_pantry_items
      FOR ALL
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END
$$;

-- ============================================================
-- 4. Trigger pentru updated_at (folosim funcția existentă sau creăm)
-- ============================================================

-- Funcția kb_touch_updated_at există deja în schema KlarBudget.
-- Dacă nu există, o creăm:
CREATE OR REPLACE FUNCTION public.kb_touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS kb_pantry_items_touch_updated_at ON public.kb_pantry_items;
CREATE TRIGGER kb_pantry_items_touch_updated_at
  BEFORE UPDATE ON public.kb_pantry_items
  FOR EACH ROW EXECUTE FUNCTION public.kb_touch_updated_at();

-- ============================================================
-- 5. Index util pentru filtrare rapidă
-- ============================================================

CREATE INDEX IF NOT EXISTS kb_pantry_items_user_id_idx
  ON public.kb_pantry_items (user_id);

CREATE INDEX IF NOT EXISTS kb_pantry_items_active_idx
  ON public.kb_pantry_items (user_id, active);

-- ============================================================
-- GATA. Tabelul kb_pantry_items a fost creat.
-- Câmpuri:
--   id, user_id, name, category, quantity, min_quantity,
--   unit, expiry_date, preferred_store, notes,
--   buy_on_offer, active, created_at, updated_at
-- RLS: utilizatorul autentificat vede doar propriile rânduri.
-- ============================================================
