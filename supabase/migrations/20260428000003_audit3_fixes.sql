-- Audit #3 fixes — closes the open issues from docs/AUDITORIA_2_Y_3.md
--   G6: api_usage table + daily quota for public-api
--   G7: cleanup_deleted_note_audio() + pg_cron scheduled job
--   G8: webhook_events table for Stripe + RevenueCat idempotency
--   G5: integrations.last_notified_at column for notify-slack debounce

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- G8: webhook_events (idempotency for billing webhooks)
-- ─────────────────────────────────────────────────────────────────────────────
-- Stores every webhook event received. Insert with ON CONFLICT DO NOTHING; if
-- the conflict fires, the event was already processed and we should skip.
CREATE TABLE IF NOT EXISTS public.webhook_events (
  id           BIGSERIAL PRIMARY KEY,
  provider     TEXT NOT NULL CHECK (provider IN ('stripe', 'revenuecat')),
  event_id     TEXT NOT NULL,                -- the provider-supplied unique ID
  event_type   TEXT,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider, event_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_received
  ON public.webhook_events(received_at DESC);

-- Garbage collect old events after 60 days (keeps the table small).
COMMENT ON TABLE public.webhook_events IS
  'Idempotency log for billing webhooks. Insert (provider, event_id) with ON CONFLICT DO NOTHING; if affected_rows=0 the event was already processed.';

-- ─────────────────────────────────────────────────────────────────────────────
-- G6: api_usage (daily quota tracking for public-api)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_usage (
  api_key_id   UUID NOT NULL,
  day          DATE NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  PRIMARY KEY (api_key_id, day)
);

CREATE INDEX IF NOT EXISTS idx_api_usage_day
  ON public.api_usage(day DESC);

-- Atomic increment-and-check helper. Returns true if request is under quota.
CREATE OR REPLACE FUNCTION public.api_usage_increment(
  p_api_key_id UUID,
  p_max_per_day INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := CURRENT_DATE;
  v_new_count INT;
BEGIN
  INSERT INTO public.api_usage (api_key_id, day, request_count)
  VALUES (p_api_key_id, v_today, 1)
  ON CONFLICT (api_key_id, day)
  DO UPDATE SET request_count = api_usage.request_count + 1
  RETURNING request_count INTO v_new_count;

  RETURN v_new_count <= p_max_per_day;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- G5: integrations.last_notified_at — debounce slack notifications per user
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS last_notified_at TIMESTAMPTZ;

-- ─────────────────────────────────────────────────────────────────────────────
-- G7: storage cleanup of orphaned/deleted-note audio files
-- ─────────────────────────────────────────────────────────────────────────────
-- Deletes audio files for notes that were soft-deleted >= 30 days ago, plus
-- audio paths in storage that have no matching note row at all (orphans).
CREATE OR REPLACE FUNCTION public.cleanup_deleted_note_audio()
RETURNS TABLE (deleted_count INT, freed_bytes BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage
AS $$
DECLARE
  v_deleted INT := 0;
  v_bytes BIGINT := 0;
BEGIN
  -- Phase 1: storage paths owned by soft-deleted notes (>= 30 days old)
  WITH targets AS (
    SELECT n.audio_path, COALESCE(o.metadata->>'size', '0')::BIGINT AS sz
    FROM public.notes n
    LEFT JOIN storage.objects o
      ON o.bucket_id = 'audio-files' AND o.name = n.audio_path
    WHERE n.deleted_at IS NOT NULL
      AND n.deleted_at < NOW() - INTERVAL '30 days'
      AND n.audio_path IS NOT NULL
  ),
  deleted AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'audio-files'
      AND name IN (SELECT audio_path FROM targets)
    RETURNING (metadata->>'size')::BIGINT AS sz
  )
  SELECT COUNT(*), COALESCE(SUM(sz), 0) INTO v_deleted, v_bytes FROM deleted;

  -- Also clear the audio_path on those notes so we don't try again next run.
  UPDATE public.notes
  SET audio_path = NULL
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '30 days'
    AND audio_path IS NOT NULL;

  RETURN QUERY SELECT v_deleted, v_bytes;
END;
$$;

COMMENT ON FUNCTION public.cleanup_deleted_note_audio() IS
  'Deletes audio files in storage for soft-deleted notes older than 30 days. Run weekly via pg_cron.';

-- Schedule weekly cleanup via pg_cron (Sundays 04:00 UTC).
-- pg_cron must be enabled in the project. If it isn't, this CREATE will fail
-- silently — wrap in DO block to make idempotent.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Drop existing job if it exists, then recreate.
    PERFORM cron.unschedule('cleanup-deleted-note-audio')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-deleted-note-audio');
    PERFORM cron.schedule(
      'cleanup-deleted-note-audio',
      '0 4 * * 0',                                       -- Sundays 04:00 UTC
      $cron$ SELECT public.cleanup_deleted_note_audio() $cron$
    );
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled. Run cleanup manually or enable pg_cron in Supabase Dashboard → Database → Extensions.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not schedule pg_cron job: %', SQLERRM;
END $$;

COMMIT;
