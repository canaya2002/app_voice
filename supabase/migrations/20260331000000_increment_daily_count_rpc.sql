-- ==========================================================================
-- Add missing increment_daily_count() RPC function
-- Used by process-audio edge function for atomic daily limit enforcement
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.increment_daily_count(
  user_id_input UUID,
  max_count INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Auto-reset if new day
  UPDATE public.profiles
  SET daily_count = 0,
      daily_audio_minutes = 0,
      last_reset_date = CURRENT_DATE
  WHERE id = user_id_input
    AND last_reset_date < CURRENT_DATE;

  -- Atomically increment only if under limit
  UPDATE public.profiles
  SET daily_count = daily_count + 1
  WHERE id = user_id_input
    AND daily_count < max_count;

  RETURN FOUND;
END;
$$;

-- Also add missing columns used in code but not in previous migrations
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS folder_id UUID;
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE;

-- Index for share token lookups
CREATE INDEX IF NOT EXISTS idx_notes_share_token ON public.notes(share_token) WHERE share_token IS NOT NULL;

-- Index for soft-delete queries
CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON public.notes(user_id, deleted_at) WHERE deleted_at IS NULL;
