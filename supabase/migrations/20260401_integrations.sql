-- ==========================================================================
-- Sythio — Integrations: Slack webhooks, Calendar connections
-- Idempotent — safe to re-run.
-- ==========================================================================

BEGIN;

-- =========================================================================
-- 1. INTEGRATIONS table (generic: slack, google_calendar, etc.)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.integrations (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL CHECK (provider IN ('slack', 'google_calendar', 'outlook_calendar')),
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- slack: { webhook_url, channel_name, notify_on: ['processing_complete','daily_summary'] }
  -- google_calendar: { access_token, refresh_token, calendar_id, auto_join: bool }
  enabled       BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_integrations_user
  ON public.integrations(user_id);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='integrations' AND policyname='Users manage own integrations') THEN
    CREATE POLICY "Users manage own integrations" ON public.integrations FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Trigger
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_integrations_updated_at') THEN
    CREATE TRIGGER trg_integrations_updated_at
      BEFORE UPDATE ON public.integrations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMIT;
