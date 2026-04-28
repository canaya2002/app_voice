-- Storage cleanup policy — FINAL (2026-04-28):
-- ALL trashed audio files are auto-deleted after 7 days, regardless of user tier.
-- Simple, predictable: papelera = 7 días → audio borrado.

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
    SELECT n.audio_path, COALESCE(o.metadata->>'size', '0')::BIGINT AS sz
    FROM public.notes n
    LEFT JOIN storage.objects o
      ON o.bucket_id = 'audio-files' AND o.name = n.audio_path
    WHERE n.deleted_at IS NOT NULL
      AND n.deleted_at < NOW() - INTERVAL '7 days'
      AND n.audio_path IS NOT NULL
  ),
  deleted AS (
    DELETE FROM storage.objects
    WHERE bucket_id = 'audio-files'
      AND name IN (SELECT audio_path FROM targets)
    RETURNING (metadata->>'size')::BIGINT AS sz
  )
  SELECT COUNT(*), COALESCE(SUM(sz), 0) INTO v_deleted, v_bytes FROM deleted;

  -- Clear audio_path on the now-stripped notes.
  UPDATE public.notes
  SET audio_path = NULL
  WHERE deleted_at IS NOT NULL
    AND deleted_at < NOW() - INTERVAL '7 days'
    AND audio_path IS NOT NULL;

  RETURN QUERY SELECT v_deleted, v_bytes;
END;
$$;

COMMENT ON FUNCTION public.cleanup_deleted_note_audio() IS
  'Auto-cleanup (2026-04-28): deletes audio in storage for ALL notes trashed >= 7 days, regardless of tier. Run daily via pg_cron.';
