-- Distributed IP rate limiting backed by Postgres.
--
-- Replaces in-memory `Map<ip, count>` rate limiters in process-audio,
-- convert-mode, chat-notes and get-shared-note. The in-memory approach
-- reset on every cold start and was bypassable by rotating across edge
-- regions — the audit flagged it as a ~$3K/mo abuse vector.
--
-- Atomic UPSERT inside check_ip_rate_limit() avoids the read-then-write
-- race between concurrent requests. Cleanup runs daily via pg_cron.

BEGIN;

-- ── Table ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ip_rate_limits (
  ip text NOT NULL,
  endpoint text NOT NULL,
  count int NOT NULL DEFAULT 0,
  reset_at timestamptz NOT NULL,
  PRIMARY KEY (ip, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_ip_rate_limits_reset_at
  ON public.ip_rate_limits (reset_at);

-- Service role accesses this table directly via the RPC; no other role should.
ALTER TABLE public.ip_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ip_rate_limits FROM PUBLIC;
REVOKE ALL ON public.ip_rate_limits FROM authenticated;
REVOKE ALL ON public.ip_rate_limits FROM anon;

-- ── RPC ───────────────────────────────────────────────────────────────────
-- Atomically increments the counter for (ip, endpoint). If the window has
-- expired (reset_at <= now), the counter resets to 1 and a new window is
-- started. Returns whether the caller is still under the limit and, if not,
-- how many seconds until the window resets.
CREATE OR REPLACE FUNCTION public.check_ip_rate_limit(
  p_ip text,
  p_endpoint text,
  p_max_count int,
  p_window_seconds int
)
RETURNS TABLE(allowed boolean, retry_after int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_reset_at timestamptz;
  v_count int;
BEGIN
  INSERT INTO public.ip_rate_limits (ip, endpoint, count, reset_at)
  VALUES (
    p_ip,
    p_endpoint,
    1,
    v_now + (p_window_seconds || ' seconds')::interval
  )
  ON CONFLICT (ip, endpoint) DO UPDATE SET
    count = CASE
      WHEN public.ip_rate_limits.reset_at <= v_now THEN 1
      ELSE public.ip_rate_limits.count + 1
    END,
    reset_at = CASE
      WHEN public.ip_rate_limits.reset_at <= v_now
        THEN v_now + (p_window_seconds || ' seconds')::interval
      ELSE public.ip_rate_limits.reset_at
    END
  RETURNING public.ip_rate_limits.count, public.ip_rate_limits.reset_at
    INTO v_count, v_reset_at;

  IF v_count > p_max_count THEN
    RETURN QUERY SELECT false, GREATEST(EXTRACT(EPOCH FROM (v_reset_at - v_now))::int, 1);
  ELSE
    RETURN QUERY SELECT true, 0;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_ip_rate_limit(text, text, int, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_ip_rate_limit(text, text, int, int) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_ip_rate_limit(text, text, int, int) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_ip_rate_limit(text, text, int, int) TO service_role;

-- ── Cleanup cron ──────────────────────────────────────────────────────────
-- Drop expired entries daily so the table doesn't grow unbounded.
-- Keep a 1-hour grace period after expiry for log/debug purposes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ip-rate-limit-cleanup') THEN
    PERFORM cron.unschedule('ip-rate-limit-cleanup');
  END IF;

  PERFORM cron.schedule(
    'ip-rate-limit-cleanup',
    '0 5 * * *',                  -- Daily at 05:00 UTC
    $cron$ DELETE FROM public.ip_rate_limits WHERE reset_at < now() - interval '1 hour' $cron$
  );

  RAISE NOTICE 'Scheduled ip-rate-limit-cleanup — runs daily at 05:00 UTC';
END $$;

COMMIT;
