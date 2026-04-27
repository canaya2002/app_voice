-- ==========================================================================
-- Add profile fields for welcome screen data (name, avatar, vocabulary)
-- Safe to run multiple times.
-- ==========================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS custom_vocabulary JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS welcome_completed BOOLEAN DEFAULT false;
