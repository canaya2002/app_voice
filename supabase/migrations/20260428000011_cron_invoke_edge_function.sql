-- Replace the cleanup cron job to invoke the storage-cleanup edge function via pg_net.
-- (Direct DELETE from storage.objects is blocked by Supabase, so we use the Storage API
--  through an edge function.)

BEGIN;

-- Drop the legacy SQL cleanup function — replaced by the edge function.
DROP FUNCTION IF EXISTS public.cleanup_deleted_note_audio() CASCADE;

-- Ensure pg_net is available for HTTP calls from cron.
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Wrapper function that invokes the storage-cleanup edge function.
-- The shared secret is hardcoded here; the function is SECURITY DEFINER and
-- revoked from public so end users can't read it. cron.job is admin-only too.
CREATE OR REPLACE FUNCTION public.invoke_storage_cleanup()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_request_id BIGINT;
BEGIN
  SELECT net.http_post(
    url := 'https://oewjbeqwihhzuvbsfctf.supabase.co/functions/v1/storage-cleanup',
    headers := jsonb_build_object(
      'Authorization', 'Bearer f716d43c75e8953d9aacd97e611b562f0b951ca28b9bbe6db33e5c12565abbbb',
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
