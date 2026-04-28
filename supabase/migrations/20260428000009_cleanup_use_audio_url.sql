-- Fix the cleanup function — column is `audio_url`, not `audio_path`.
-- (The column stores a storage key like `<user_id>/<uuid>.m4a`, not an actual URL.)

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
  -- Target: any trashed note >= 7 days old (any tier).
  WITH targets AS (
    SELECT n.audio_url AS storage_path, COALESCE(o.metadata->>'size', '0')::BIGINT AS sz
    FROM public.notes n
    LEFT JOIN storage.objects o
      ON o.bucket_id = 'audio-files' AND o.name = n.audio_url
    WHERE n.deleted_at IS NOT NULL
      AND n.deleted_at < NOW() - INTERVAL '7 days'
      AND n.audio_url IS NOT NULL
      AND n.audio_url <> ''
  ),
  deleted AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'audio-files'
      AND name IN (SELECT storage_path FROM targets WHERE storage_path IS NOT NULL)
    RETURNING (metadata->>'size')::BIGINT AS sz
  )
  SELECT COUNT(*), COALESCE(SUM(sz), 0) INTO v_deleted, v_bytes FROM deleted;

  -- Clear audio_url on the now-stripped notes (set to empty string to match column NOT NULL DEFAULT '').
  UPDATE public.notes
  SET audio_url = ''
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '7 days'
    AND audio_url IS NOT NULL
    AND audio_url <> '';

  RETURN QUERY SELECT v_deleted, v_bytes;
END;
$$;

COMMENT ON FUNCTION public.cleanup_deleted_note_audio() IS
  'Auto-cleanup: deletes audio in storage for notes trashed >= 7 days. Runs daily at 04:00 UTC via pg_cron.';
