-- ==========================================================================
-- Add retry_count to notes for tracking reprocessing attempts
-- Run in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ==========================================================================

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.notes.retry_count
  IS 'Number of times this note has been re-processed after an error. Max 2.';

-- Push token for notifications (nullable — only set when user grants permission)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- Daily audio minutes tracking for premium 120min/day cap
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS daily_audio_minutes INT NOT NULL DEFAULT 0;

-- ==========================================================================
-- Verify:
--   SELECT column_name, data_type, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'notes' AND column_name = 'retry_count';
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'profiles' AND column_name = 'push_token';
-- ==========================================================================
