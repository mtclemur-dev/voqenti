-- Istoric plăți lunare la datorii (tabelul kb_payments există în KB_SCHEMA.sql)
-- Rulează dacă lipsește tabelul sau coloana initial_final_payment.

CREATE TABLE IF NOT EXISTS public.kb_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  debt_id uuid REFERENCES public.kb_debts(id) ON DELETE SET NULL,
  expense_id uuid,
  name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  payment_type text NOT NULL DEFAULT 'debt' CHECK (payment_type IN ('income', 'expense', 'debt')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.kb_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_payments_all_own ON public.kb_payments;
CREATE POLICY kb_payments_all_own ON public.kb_payments
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.kb_debts
ADD COLUMN IF NOT EXISTS initial_final_payment numeric(12,2);

UPDATE public.kb_debts
SET initial_final_payment = final_payment
WHERE initial_final_payment IS NULL;

COMMENT ON COLUMN public.kb_debts.initial_final_payment IS
  'Schlussrate la început (pentru calcul plătit vs total).';
