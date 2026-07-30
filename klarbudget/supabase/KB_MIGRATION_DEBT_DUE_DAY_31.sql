-- Extinde payment_due_day de la 28 la 31 (dacă ai rulat deja migrarea inițială).
-- Rulează în Supabase SQL Editor.

ALTER TABLE public.kb_debts DROP CONSTRAINT IF EXISTS kb_debts_payment_due_day_check;

ALTER TABLE public.kb_debts
ADD CONSTRAINT kb_debts_payment_due_day_check
  CHECK (payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 31));

COMMENT ON COLUMN public.kb_debts.payment_due_day IS
  'Ziua din lună pentru rata lunară (1-31, fără lună/an). Se repetă automat în fiecare lună.';
