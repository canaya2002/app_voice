-- Quick sanity check — log the scheduled cron jobs.
-- This is a NOOP migration whose only effect is to NOTICE the cron state.

DO $$
DECLARE
  r RECORD;
  job_count INT := 0;
BEGIN
  FOR r IN SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'cleanup-deleted-note-audio' LOOP
    job_count := job_count + 1;
    RAISE NOTICE 'Cron job present: % | schedule: % | cmd: %', r.jobname, r.schedule, r.command;
  END LOOP;

  IF job_count = 0 THEN
    RAISE NOTICE 'NO cron job found. cleanup-deleted-note-audio is NOT scheduled.';
  END IF;
END $$;
