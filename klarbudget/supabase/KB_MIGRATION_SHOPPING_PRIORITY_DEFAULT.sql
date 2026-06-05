-- Set default priority for shopping list items and fix existing NULL values.
ALTER TABLE public.kb_shopping_list
ALTER COLUMN priority SET DEFAULT 'normal';

UPDATE public.kb_shopping_list
SET priority = 'normal'
WHERE priority IS NULL;

ALTER TABLE public.kb_shopping_list
ALTER COLUMN priority SET NOT NULL;

ALTER TABLE public.kb_shopping_list
DROP CONSTRAINT IF EXISTS kb_shopping_list_priority_check;

ALTER TABLE public.kb_shopping_list
ADD CONSTRAINT kb_shopping_list_priority_check
CHECK (priority IN ('normal', 'important', 'offer_only'));
