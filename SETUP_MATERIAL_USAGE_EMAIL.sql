-- Daily email schedule for material usage summary
-- Run this in Supabase SQL Editor after SETUP_MATERIALS.sql
-- The cron time below is 17:00 UTC. Adjust it if you want another hour.

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

SELECT cron.unschedule('daily-material-usage-email')
WHERE EXISTS (
  SELECT 1
  FROM cron.job
  WHERE jobname = 'daily-material-usage-email'
);

SELECT cron.schedule(
  'daily-material-usage-email',
  '0 17 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ybgjxdlegdgdgpznbiiu.supabase.co/functions/v1/send-material-usage-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer sb_publishable_2_bOkxUu3UfznQbVSDFjzw_ov4A_qYZ',
      'apikey', 'sb_publishable_2_bOkxUu3UfznQbVSDFjzw_ov4A_qYZ',
      'x-cron-secret', 'dw-material-usage-2026-05'
    ),
    body := '{}'::jsonb
  );
  $$
);
