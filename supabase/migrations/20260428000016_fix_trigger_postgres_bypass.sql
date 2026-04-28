-- Fix the guard trigger so it doesn't block direct postgres connections (migrations).
-- The original logic checked for 'service_role' explicitly, but migrations run as
-- 'postgres' (superuser) without a JWT, so the trigger blocked them too.
--
-- New logic: BLOCK only if the role is 'authenticated' or 'anon' (end users via PostgREST).
-- Allow everything else (service_role, postgres, supabase_admin, etc.)

CREATE OR REPLACE FUNCTION public.guard_profiles_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  -- Read the JWT role; if no JWT (e.g. direct postgres connection), default to NULL.
  caller_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';

  -- Only block 'authenticated' and 'anon' roles. service_role / postgres / etc. pass through.
  IF caller_role IS NOT NULL AND caller_role IN ('authenticated', 'anon') THEN
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
  END IF;

  RETURN NEW;
END;
$$;

-- NOW set the admins (this UPDATE will pass the trigger because we run as postgres)
UPDATE public.profiles SET is_admin = true
WHERE id IN (
  SELECT u.id FROM auth.users u
  WHERE lower(u.email) IN ('canayar@manuelsolis.com', 'canaya917@gmail.com')
);

-- Verify
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== Admins after fix ===';
  FOR r IN SELECT email, is_admin FROM public.profiles WHERE is_admin = true LOOP
    RAISE NOTICE '✓ Admin: %', r.email;
  END LOOP;
END $$;
