-- Admin flag for the founder/operator dashboard at /admin.
-- Only users with profiles.is_admin = true can access /admin endpoints.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_profiles_is_admin
  ON public.profiles(is_admin) WHERE is_admin = true;

-- Set Carlos's accounts as admin (idempotent — does nothing if email not registered).
DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN
    SELECT u.id FROM auth.users u
    WHERE lower(u.email) IN ('canayar@manuelsolis.com', 'canaya917@gmail.com')
  LOOP
    UPDATE public.profiles SET is_admin = true WHERE id = v_id;
  END LOOP;
END $$;

-- Protect is_admin from being self-assigned via RLS.
-- Update the existing guard trigger to also block changes to is_admin.
CREATE OR REPLACE FUNCTION public.guard_profiles_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service_role BOOLEAN;
BEGIN
  is_service_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
  IF is_service_role THEN
    RETURN NEW;
  END IF;

  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'Field "plan" is read-only for users.' USING ERRCODE = '42501';
  END IF;
  IF NEW.daily_count IS DISTINCT FROM OLD.daily_count THEN
    RAISE EXCEPTION 'Field "daily_count" is read-only.' USING ERRCODE = '42501';
  END IF;
  IF NEW.daily_audio_minutes IS DISTINCT FROM OLD.daily_audio_minutes THEN
    RAISE EXCEPTION 'Field "daily_audio_minutes" is read-only.' USING ERRCODE = '42501';
  END IF;
  IF NEW.daily_chat_count IS DISTINCT FROM OLD.daily_chat_count THEN
    RAISE EXCEPTION 'Field "daily_chat_count" is read-only.' USING ERRCODE = '42501';
  END IF;
  IF NEW.daily_convert_count IS DISTINCT FROM OLD.daily_convert_count THEN
    RAISE EXCEPTION 'Field "daily_convert_count" is read-only.' USING ERRCODE = '42501';
  END IF;
  IF NEW.last_reset_date IS DISTINCT FROM OLD.last_reset_date THEN
    RAISE EXCEPTION 'Field "last_reset_date" is read-only.' USING ERRCODE = '42501';
  END IF;
  IF NEW.plan_expires_at IS DISTINCT FROM OLD.plan_expires_at THEN
    RAISE EXCEPTION 'Field "plan_expires_at" is read-only.' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'Field "is_admin" is read-only.' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMIT;
