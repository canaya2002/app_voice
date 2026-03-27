-- ==========================================================================
-- Sythio — Full production schema (idempotent)
-- Run in Supabase SQL Editor. Safe to execute multiple times.
-- ==========================================================================
-- ROLLBACK: This script uses IF NOT EXISTS / IF EXISTS guards throughout.
-- If something fails mid-way, fix the issue and re-run — it will skip
-- already-completed steps. No manual rollback needed.
-- ==========================================================================

BEGIN;

-- =========================================================================
-- 1. TABLES
-- =========================================================================

-- 1a. profiles
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  plan        TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'premium')),
  daily_count INT NOT NULL DEFAULT 0,
  daily_audio_minutes INT NOT NULL DEFAULT 0,
  last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE,
  premium_interest BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns exist (for existing installs)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_audio_minutes INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_reset_date DATE NOT NULL DEFAULT CURRENT_DATE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS premium_interest BOOLEAN NOT NULL DEFAULT false;

-- 1b. notes
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           TEXT NOT NULL DEFAULT '',
  audio_url       TEXT NOT NULL DEFAULT '',
  audio_duration  INT NOT NULL DEFAULT 0,
  transcript      TEXT NOT NULL DEFAULT '',
  summary         TEXT NOT NULL DEFAULT '',
  key_points      JSONB NOT NULL DEFAULT '[]'::jsonb,
  tasks           JSONB NOT NULL DEFAULT '[]'::jsonb,
  clean_text      TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'recording'
                    CHECK (status IN ('recording','uploading','transcribing','processing','done','error')),
  error_message   TEXT,
  speakers_detected INT NOT NULL DEFAULT 1,
  is_conversation BOOLEAN NOT NULL DEFAULT false,
  segments        JSONB NOT NULL DEFAULT '[]'::jsonb,
  speakers        JSONB NOT NULL DEFAULT '[]'::jsonb,
  primary_mode    TEXT NOT NULL DEFAULT 'summary',
  template        TEXT,
  retry_count     INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure columns added after initial creation
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS speakers_detected INT NOT NULL DEFAULT 1;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS is_conversation BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS segments JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS speakers JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS primary_mode TEXT NOT NULL DEFAULT 'summary';
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS template TEXT;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

-- 1c. mode_results
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mode_results (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id    UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  mode       TEXT NOT NULL,
  result     JSONB NOT NULL DEFAULT '{}'::jsonb,
  tone       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 1d. analytics_events
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event      TEXT NOT NULL,
  properties JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- =========================================================================
-- 2. INDEXES
-- =========================================================================

CREATE INDEX IF NOT EXISTS idx_notes_user_created
  ON public.notes(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notes_user_status
  ON public.notes(user_id, status);

CREATE INDEX IF NOT EXISTS idx_mode_results_note_mode
  ON public.mode_results(note_id, mode);

CREATE INDEX IF NOT EXISTS idx_mode_results_note_created
  ON public.mode_results(note_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_user_created
  ON public.analytics_events(user_id, created_at);

CREATE INDEX IF NOT EXISTS idx_analytics_event
  ON public.analytics_events(event);


-- =========================================================================
-- 3. ROW LEVEL SECURITY
-- =========================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mode_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Helper: idempotent policy creation
-- (pg_policies may not have schemaname in all PG versions, so we use tablename)

-- 3a. profiles
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users read own profile') THEN
    CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='profiles' AND policyname='Users update own profile') THEN
    CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
  END IF;
END $$;

-- 3b. notes
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Users read own notes') THEN
    CREATE POLICY "Users read own notes" ON public.notes FOR SELECT TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Users insert own notes') THEN
    CREATE POLICY "Users insert own notes" ON public.notes FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Users update own notes') THEN
    CREATE POLICY "Users update own notes" ON public.notes FOR UPDATE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='notes' AND policyname='Users delete own notes') THEN
    CREATE POLICY "Users delete own notes" ON public.notes FOR DELETE TO authenticated USING (auth.uid() = user_id);
  END IF;
END $$;

-- 3c. mode_results (join-based: user owns the parent note)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mode_results' AND policyname='Users read own mode results') THEN
    CREATE POLICY "Users read own mode results" ON public.mode_results FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.notes WHERE notes.id = note_id AND notes.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='mode_results' AND policyname='Users insert own mode results') THEN
    CREATE POLICY "Users insert own mode results" ON public.mode_results FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.notes WHERE notes.id = note_id AND notes.user_id = auth.uid()));
  END IF;
END $$;

-- 3d. analytics_events (insert only for authenticated, read only via service_role)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='analytics_events' AND policyname='Users insert own events') THEN
    CREATE POLICY "Users insert own events" ON public.analytics_events FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- No SELECT policy for authenticated = service_role only can read analytics


-- =========================================================================
-- 4. AUTO-UPDATED_AT TRIGGER
-- =========================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_notes_updated_at') THEN
    CREATE TRIGGER trg_notes_updated_at
      BEFORE UPDATE ON public.notes
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;


-- =========================================================================
-- 5. AUTO-RESET daily_count TRIGGER
-- =========================================================================
-- Resets daily_count to 0 when a profile row is read/updated and
-- last_reset_date is stale. Runs on UPDATE to profiles.

CREATE OR REPLACE FUNCTION public.auto_reset_daily_count()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.last_reset_date < CURRENT_DATE THEN
    NEW.daily_count := 0;
    NEW.daily_audio_minutes := 0;
    NEW.last_reset_date := CURRENT_DATE;
  END IF;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auto_reset_daily') THEN
    CREATE TRIGGER trg_auto_reset_daily
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.auto_reset_daily_count();
  END IF;
END $$;


-- =========================================================================
-- 6. delete_user() RPC
-- =========================================================================
-- Called from profile.tsx. SECURITY DEFINER runs as table owner.
-- CASCADE foreign keys handle: notes → mode_results, analytics_events.

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  -- 1. Delete mode_results (via CASCADE from notes, but explicit for clarity)
  DELETE FROM public.mode_results
    WHERE note_id IN (SELECT id FROM public.notes WHERE user_id = uid);

  -- 2. Delete notes (CASCADE will also clean mode_results if step 1 missed any)
  DELETE FROM public.notes WHERE user_id = uid;

  -- 3. Delete analytics events
  DELETE FROM public.analytics_events WHERE user_id = uid;

  -- 4. Delete profile
  DELETE FROM public.profiles WHERE id = uid;

  -- 5. Delete auth user (this also invalidates all sessions)
  DELETE FROM auth.users WHERE id = uid;
END;
$$;


-- =========================================================================
-- 7. AUTO-CREATE PROFILE ON SIGNUP
-- =========================================================================
-- Trigger on auth.users INSERT to create a matching profiles row.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, plan, daily_count, last_reset_date)
  VALUES (NEW.id, NEW.email, 'free', 0, CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  END IF;
END $$;


-- =========================================================================
-- 8. STORAGE BUCKET: audio-files
-- =========================================================================
-- Note: Supabase storage buckets are managed via the dashboard or API,
-- not raw SQL. Run these via the Supabase dashboard Storage settings:
--
--   1. Create bucket "audio-files" (private, not public)
--   2. Add policy "Users upload to own folder":
--      - Operation: INSERT
--      - Target: authenticated
--      - Policy: (bucket_id = 'audio-files') AND (auth.uid()::text = (storage.foldername(name))[1])
--   3. Add policy "Users read own files":
--      - Operation: SELECT
--      - Target: authenticated
--      - Policy: (bucket_id = 'audio-files') AND (auth.uid()::text = (storage.foldername(name))[1])
--   4. Add policy "Users delete own files":
--      - Operation: DELETE
--      - Target: authenticated
--      - Policy: (bucket_id = 'audio-files') AND (auth.uid()::text = (storage.foldername(name))[1])
--
-- Alternatively, insert the bucket via SQL (may not work on all Supabase versions):

INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-files', 'audio-files', false)
ON CONFLICT (id) DO NOTHING;


-- =========================================================================
-- 9. VERIFICATION QUERIES (run after to confirm)
-- =========================================================================
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
-- SELECT column_name, data_type, column_default FROM information_schema.columns WHERE table_name = 'notes' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'profiles' ORDER BY ordinal_position;
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
-- SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname;
-- SELECT tgname, tgrelid::regclass FROM pg_trigger WHERE tgname LIKE 'trg_%' OR tgname = 'on_auth_user_created';

COMMIT;

-- ==========================================================================
-- DONE. Schema is production-ready.
-- ==========================================================================
