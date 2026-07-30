-- KlarBudget: plată automată rată lunară la datorii
-- Rulează în Supabase SQL Editor.

ALTER TABLE public.kb_debts
ADD COLUMN IF NOT EXISTS payment_due_day smallint
  CHECK (payment_due_day IS NULL OR (payment_due_day >= 1 AND payment_due_day <= 28));

ALTER TABLE public.kb_debts
ADD COLUMN IF NOT EXISTS last_auto_payment_date date;

COMMENT ON COLUMN public.kb_debts.payment_due_day IS
  'Ziua lunii când e scadentă rata (1-28). După această dată, rata lunară se scade automat din sold.';

COMMENT ON COLUMN public.kb_debts.last_auto_payment_date IS
  'Data ultimei rate auto-aplicate (data scadenței procesate).';
