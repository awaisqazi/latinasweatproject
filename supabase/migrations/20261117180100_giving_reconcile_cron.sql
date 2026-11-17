-- Giving Tuesday 2026: run the Zeffy reconcile every 5 minutes.
--
-- pg_cron calls the zeffy-webhook edge function through pg_net with the
-- x-giving-cron-secret header. The secret value lives ONLY in Supabase Vault
-- (name 'giving_cron_secret', created by hand, never in the repo) and in the
-- GIVING_CRON_SECRET function secret. anon and authenticated cannot read the
-- vault schema, and cron.job is not exposed through the API.
--
-- The reconcile is a cheap no-op until a campaign has zeffy_campaign_ids and
-- ZEFFY_API_KEY is set (it answers no_api_key without calling Zeffy).
--
-- Remove after the campaign:
--   select cron.unschedule('giving-zeffy-reconcile');

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid)
from cron.job
where jobname = 'giving-zeffy-reconcile';

select cron.schedule(
  'giving-zeffy-reconcile',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://jcseaxtvsozylsbmykka.supabase.co/functions/v1/zeffy-webhook?mode=reconcile',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-giving-cron-secret', (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'giving_cron_secret'
        limit 1
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  where exists (
    select 1 from vault.decrypted_secrets where name = 'giving_cron_secret'
  );
  $job$
);
