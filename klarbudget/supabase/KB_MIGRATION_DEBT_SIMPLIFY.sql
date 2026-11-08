-- Simplificare calcul datorii: total la început + data primei rate
-- Rulează în Supabase SQL Editor.

ALTER TABLE public.kb_debts
ADD COLUMN IF NOT EXISTS starting_total numeric(12,2);

ALTER TABLE public.kb_debts
ADD COLUMN IF NOT EXISTS first_payment_date date;

UPDATE public.kb_debts
SET starting_total = COALESCE(starting_total, initial_amount + COALESCE(initial_final_payment, final_payment, 0))
WHERE starting_total IS NULL OR starting_total <= 0;

COMMENT ON COLUMN public.kb_debts.starting_total IS
  'Total de plată la început (principal + Schlussrate). Baza pentru „plătit din total”.';

COMMENT ON COLUMN public.kb_debts.first_payment_date IS
  'Data primei rate (începutul planului). Auto-rapoarte de la această dată.';
