-- ==========================================================================
-- Sythio consistency migration — closes all code-vs-schema mismatches
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ==========================================================================


-- 1. Create analytics_events table
-- ---------------------------------
-- Used by lib/analytics.ts to batch-insert tracking events.

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  properties JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user ON public.analytics_events(user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_event ON public.analytics_events(event);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created ON public.analytics_events(created_at);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'analytics_events' AND policyname = 'Users insert own events'
  ) THEN
    CREATE POLICY "Users insert own events"
      ON public.analytics_events FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'analytics_events' AND policyname = 'Users read own events'
  ) THEN
    CREATE POLICY "Users read own events"
      ON public.analytics_events FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;


-- 2. Add premium_interest column to profiles
-- -------------------------------------------
-- Used by profile.tsx to record upgrade interest.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS premium_interest BOOLEAN DEFAULT false;


-- 3. RLS policies for notes (INSERT / UPDATE / DELETE)
-- -----------------------------------------------------
-- Code writes to notes from client (notesStore) and edge functions (service role).
-- These policies cover authenticated client writes.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users insert own notes'
  ) THEN
    CREATE POLICY "Users insert own notes"
      ON public.notes FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users update own notes'
  ) THEN
    CREATE POLICY "Users update own notes"
      ON public.notes FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'notes' AND policyname = 'Users delete own notes'
  ) THEN
    CREATE POLICY "Users delete own notes"
      ON public.notes FOR DELETE
      TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;


-- 4. RLS policies for mode_results (INSERT / SELECT)
-- ----------------------------------------------------
-- Client triggers mode conversion via edge function (service role handles insert),
-- but the SELECT policy must exist for client to read results.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'mode_results' AND policyname = 'Users insert own mode results'
  ) THEN
    CREATE POLICY "Users insert own mode results"
      ON public.mode_results FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM public.notes
          WHERE notes.id = note_id AND notes.user_id = auth.uid()
        )
      );
  END IF;
END $$;


-- 5. delete_user RPC
-- -------------------
-- Called from profile.tsx to delete user account with cascade.

CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- CASCADE via foreign keys handles: notes, mode_results, analytics_events
  DELETE FROM auth.users WHERE id = auth.uid();
END;
$$;


-- ==========================================================================
-- DONE. Verify with:
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
--   SELECT column_name FROM information_schema.columns WHERE table_name = 'profiles';
--   SELECT * FROM pg_policies WHERE tablename IN ('notes', 'mode_results', 'analytics_events');
-- ==========================================================================
