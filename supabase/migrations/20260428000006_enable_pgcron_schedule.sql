-- Try to enable pg_cron and schedule the daily cleanup job.
-- pg_cron typically requires Supabase Pro plan or higher. If the CREATE
-- EXTENSION fails, the migration logs a notice and the user needs to enable
-- it manually from Dashboard → Database → Extensions.

DO $$
BEGIN
  -- Step 1: try to enable pg_cron extension
  BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    RAISE NOTICE 'pg_cron extension enabled or already present';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not enable pg_cron via SQL (%). Enable manually in Dashboard → Database → Extensions.', SQLERRM;
    RETURN;
  END;

  -- Step 2: schedule the daily cleanup job (4am UTC)
  BEGIN
    -- Drop existing job if any
    PERFORM cron.unschedule('cleanup-deleted-note-audio')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'cleanup-deleted-note-audio');

    PERFORM cron.schedule(
      'cleanup-deleted-note-audio',
      '0 4 * * *',                                       -- Daily 04:00 UTC = 22:00 CDMX
      $cron$ SELECT public.cleanup_deleted_note_audio() $cron$
    );
    RAISE NOTICE 'Cleanup job scheduled: daily at 04:00 UTC';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule cron job (%). pg_cron may need to be enabled in Dashboard first.', SQLERRM;
  END;
END $$;
