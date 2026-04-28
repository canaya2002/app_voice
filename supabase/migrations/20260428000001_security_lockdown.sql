-- Security lockdown — close credit-bypass vulnerabilities found in audit (2026-04-28).
--
-- CRITICAL FINDINGS (pre-patch state):
-- 1. profiles RLS allowed UPDATE on ALL columns including `plan`, `daily_count`,
--    `daily_audio_minutes`, `daily_chat_count`, `daily_convert_count`, `last_reset_date`.
--    → User could grant themselves Enterprise access OR reset daily counters.
-- 2. RPC increment_daily_count had no `auth.uid() = user_id_input` check.
--    → User A could DoS user B by maxing out their counters via direct RPC call.
-- 3. increment_daily_count auto-reset only updated daily_count/audio_minutes,
--    leaving daily_chat_count and daily_convert_count stale across days.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Lock down profiles UPDATE — only allow editing user-owned fields.
--    Critical fields (plan, daily counters) can ONLY be modified via service_role
--    (i.e. from edge functions or Supabase Dashboard).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users update own profile" ON public.profiles;

-- Allow update on safe fields only. Postgres RLS doesn't have a native
-- column-level CHECK in policies, so we enforce via a trigger that rejects
-- changes to protected columns when the actor is not service_role.

CREATE OR REPLACE FUNCTION public.guard_profiles_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_service_role BOOLEAN;
BEGIN
  -- service_role bypasses this guard (it's how edge functions update plan/counters)
  is_service_role := (current_setting('request.jwt.claims', true)::jsonb ->> 'role') = 'service_role';
  IF is_service_role THEN
    RETURN NEW;
  END IF;

  -- For authenticated users, reject changes to protected columns.
  IF NEW.plan IS DISTINCT FROM OLD.plan THEN
    RAISE EXCEPTION 'Field "plan" is read-only for users. Subscription tier is managed by billing webhooks.'
      USING ERRCODE = '42501';   -- insufficient_privilege
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
  -- id and created_at are PK / immutable; not enforced here but won't harm.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_protected_columns ON public.profiles;
CREATE TRIGGER trg_guard_profiles_protected_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_protected_columns();

-- Re-create the SELECT/UPDATE policies (UPDATE allowed; the trigger gates which columns).
CREATE POLICY "Users update own profile"
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Lock down subscriptions UPDATE/INSERT/DELETE for users.
--    Subscriptions are managed exclusively by Stripe/RevenueCat webhooks (service role).
-- ─────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can update own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can insert own subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Users can delete own subscriptions" ON public.subscriptions;

-- (No INSERT/UPDATE/DELETE policy = blocked for non-service-role.)
-- SELECT policy from earlier migration stays so users can read their own subscription.

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Harden increment_daily_count RPC — add auth check.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.increment_daily_count(
  user_id_input UUID,
  max_count INT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  caller_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';

  -- service_role bypass (edge functions need to call this on behalf of users)
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    -- For end users (role='authenticated'), the input MUST match their own auth.uid().
    IF auth.uid() IS NULL OR auth.uid() <> user_id_input THEN
      RAISE EXCEPTION 'Cannot increment counters for another user' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Auto-reset all daily counters if new day (atomic — single UPDATE).
  UPDATE public.profiles
  SET daily_count = 0,
      daily_audio_minutes = 0,
      daily_chat_count = 0,
      daily_convert_count = 0,
      last_reset_date = CURRENT_DATE
  WHERE id = user_id_input
    AND last_reset_date < CURRENT_DATE;

  -- Atomically increment only if under limit.
  UPDATE public.profiles
  SET daily_count = daily_count + 1
  WHERE id = user_id_input
    AND daily_count < max_count;

  RETURN FOUND;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Helper RPC for atomic daily counter resets, callable by edge functions
--    (avoids the race condition in chat-notes/convert-mode of "read then update").
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reset_daily_counters_if_new_day(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role TEXT;
BEGIN
  caller_role := current_setting('request.jwt.claims', true)::jsonb ->> 'role';
  IF caller_role IS DISTINCT FROM 'service_role' THEN
    IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
      RAISE EXCEPTION 'Cannot reset counters for another user' USING ERRCODE = '42501';
    END IF;
  END IF;

  UPDATE public.profiles
  SET daily_count = 0,
      daily_audio_minutes = 0,
      daily_chat_count = 0,
      daily_convert_count = 0,
      last_reset_date = CURRENT_DATE
  WHERE id = p_user_id
    AND last_reset_date < CURRENT_DATE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.reset_daily_counters_if_new_day(UUID) TO authenticated;

COMMIT;
