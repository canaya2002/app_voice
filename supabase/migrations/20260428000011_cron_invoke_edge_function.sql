-- Replace the cleanup cron job to invoke the storage-cleanup edge function via pg_net.
-- (Direct DELETE from storage.objects is blocked by Supabase, so we use the Storage API
--  through an edge function.)

BEGIN;

-- Drop the legacy SQL cleanup function — replaced by the edge function.
DROP FUNCTION IF EXISTS public.cleanup_deleted_note_audio() CASCADE;

-- Ensure pg_net is available for HTTP calls from cron.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Wrapper function that invokes the storage-cleanup edge function.
-- The shared secret is read from Supabase Vault at runtime (NOT hardcoded).
-- Setup: secret must be inserted into vault as 'storage_cleanup_secret' via
-- the dashboard SQL editor (see ADMIN runbook). This file does NOT contain
-- the secret value to prevent leakage in source control.
CREATE OR REPLACE FUNCTION public.invoke_storage_cleanup()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net, vault
AS $$
DECLARE
  v_request_id BIGINT;
  v_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO v_secret
  FROM vault.decrypted_secrets
  WHERE name = 'storage_cleanup_secret';

  IF v_secret IS NULL THEN
    RAISE EXCEPTION 'storage_cleanup_secret missing from vault. Set it via Dashboard SQL Editor.';
  END IF;

  SELECT net.http_post(
    url := 'https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/storage-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

-- Lock down the function — only postgres/service_role can execute it.
REVOKE EXECUTE ON FUNCTION public.invoke_storage_cleanup() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invoke_storage_cleanup() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.invoke_storage_cleanup() FROM anon;

-- (Re)schedule cron job.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-deleted-note-audio') THEN
    PERFORM cron.unschedule('cleanup-deleted-note-audio');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'storage-cleanup-daily') THEN
    PERFORM cron.unschedule('storage-cleanup-daily');
  END IF;

  PERFORM cron.schedule(
    'storage-cleanup-daily',
    '0 4 * * *',                  -- Daily at 04:00 UTC (22:00 CDMX)
    $cron$ SELECT public.invoke_storage_cleanup() $cron$
  );

  RAISE NOTICE 'Scheduled storage-cleanup-daily — runs daily at 04:00 UTC';
END $$;

COMMIT;
