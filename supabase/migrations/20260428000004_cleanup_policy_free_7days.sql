-- Storage cleanup policy update (2026-04-28):
-- Only auto-delete trashed audio files for FREE users, after 7 days in trash.
-- Premium / Pro+ / Enterprise users keep their trashed audio indefinitely
-- (until they manually empty the trash from the app).
--
-- Rationale: paid retention is a value-add ("nunca pierdas tus grabaciones"),
-- and only free-tier storage costs need to be capped.

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
  -- Target: trashed notes >= 7 days old, owned by FREE-tier users only.
  WITH targets AS (
    SELECT n.id AS note_id, n.audio_path, COALESCE(o.metadata->>'size', '0')::BIGINT AS sz
    FROM public.notes n
    JOIN public.profiles p ON p.id = n.user_id
    LEFT JOIN storage.objects o
      ON o.bucket_id = 'audio-files' AND o.name = n.audio_path
    WHERE n.deleted_at IS NOT NULL
      AND n.deleted_at < NOW() - INTERVAL '7 days'
      AND n.audio_path IS NOT NULL
      AND p.plan = 'free'
  ),
  deleted AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'audio-files'
      AND name IN (SELECT audio_path FROM targets)
    RETURNING (metadata->>'size')::BIGINT AS sz
  )
  SELECT COUNT(*), COALESCE(SUM(sz), 0) INTO v_deleted, v_bytes FROM deleted;

  -- Clear audio_path on the now-stripped free-user notes (avoid re-processing).
  UPDATE public.notes n
  SET audio_path = NULL
  FROM public.profiles p
  WHERE n.user_id = p.id
    AND n.deleted_at IS NOT NULL
    AND n.deleted_at < NOW() - INTERVAL '7 days'
    AND n.audio_path IS NOT NULL
    AND p.plan = 'free';

  RETURN QUERY SELECT v_deleted, v_bytes;
END;
$$;

COMMENT ON FUNCTION public.cleanup_deleted_note_audio() IS
  'Auto-cleanup policy (2026-04-28): deletes audio in storage for FREE-tier notes that have been in trash >= 7 days. Paid tiers (premium/pro_plus/enterprise) keep trashed audio indefinitely. Run daily via pg_cron.';

-- Update schedule from weekly to daily (since 7-day threshold is short).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-deleted-note-audio')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-deleted-note-audio');
    PERFORM cron.schedule(
      'cleanup-deleted-note-audio',
      '0 4 * * *',                                       -- Daily at 04:00 UTC
      $cron$ SELECT public.cleanup_deleted_note_audio() $cron$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available — schedule manually after enabling extension.';
END $$;
