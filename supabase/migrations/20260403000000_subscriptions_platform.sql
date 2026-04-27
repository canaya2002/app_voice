-- ==========================================================================
-- Sythio — Subscriptions & Platform Sessions
-- Cross-platform subscription management:
--   - One Supabase account per email (shared web/iOS/Android)
--   - Subscription managed ONLY on the platform where purchased
--   - iOS (RevenueCat) subs cannot be modified from web, and vice versa
-- Safe to run multiple times (IF NOT EXISTS guards).
-- ==========================================================================

BEGIN;

-- =========================================================================
-- 1. SUBSCRIPTIONS TABLE
-- =========================================================================
-- Tracks active subscriptions per platform. A user can have at most one
-- subscription per platform (enforced by UNIQUE constraint).
-- Only service_role can write — client can only read their own rows.

CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform                 TEXT NOT NULL CHECK (platform IN ('ios', 'web', 'android')),
  status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  plan                     TEXT NOT NULL DEFAULT 'pro'
                             CHECK (plan IN ('pro', 'team')),
  product_id               TEXT,          -- RevenueCat product ID or Stripe price ID
  platform_subscription_id TEXT,          -- RevenueCat or Stripe subscription ID
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(user_id, platform)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status, current_period_end);

-- =========================================================================
-- 2. PLATFORM SESSIONS TABLE
-- =========================================================================
-- Tracks which platforms a user has logged in from.
-- Used to show platform-aware UI (e.g. "you have an iOS subscription").

CREATE TABLE IF NOT EXISTS public.platform_sessions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'web', 'android')),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_info JSONB DEFAULT '{}'::jsonb,

  UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_user ON public.platform_sessions(user_id);

-- =========================================================================
-- 3. ADD plan_expires_at TO PROFILES (for quick plan checks)
-- =========================================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;

-- Update plan CHECK constraint to include 'team' if not already
-- (safe: DO NOTHING if constraint doesn't exist or already correct)
DO $$
BEGIN
  -- Drop old constraint if it only allows free/premium
  ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
  -- Add new constraint allowing free/premium/pro/team
  ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check
    CHECK (plan IN ('free', 'premium', 'pro', 'team'));
EXCEPTION WHEN OTHERS THEN
  NULL; -- ignore if constraint manipulation fails
END $$;

-- =========================================================================
-- 4. RLS POLICIES
-- =========================================================================

-- Enable RLS
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_sessions ENABLE ROW LEVEL SECURITY;

-- Subscriptions: users can only READ their own rows, NEVER write directly
-- (only service_role can insert/update via webhooks)
DROP POLICY IF EXISTS "Users can read own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Platform sessions: users can read and upsert their own
DROP POLICY IF EXISTS "Users can read own platform sessions" ON public.platform_sessions;
CREATE POLICY "Users can read own platform sessions"
  ON public.platform_sessions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can upsert own platform sessions" ON public.platform_sessions;
CREATE POLICY "Users can upsert own platform sessions"
  ON public.platform_sessions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own platform sessions" ON public.platform_sessions;
CREATE POLICY "Users can update own platform sessions"
  ON public.platform_sessions FOR UPDATE
  USING (auth.uid() = user_id);

-- =========================================================================
-- 5. FUNCTION: get_user_effective_plan
-- =========================================================================
-- Returns the best active plan for a user across all platforms.
-- Priority: team > pro > premium > free

CREATE OR REPLACE FUNCTION public.get_user_effective_plan(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  active_plan TEXT;
BEGIN
  SELECT plan INTO active_plan
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trial')
    AND current_period_end > NOW()
  ORDER BY
    CASE plan WHEN 'team' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END
  LIMIT 1;

  -- Also check the legacy plan column on profiles
  IF active_plan IS NULL THEN
    SELECT plan INTO active_plan
    FROM public.profiles
    WHERE id = p_user_id AND plan IN ('premium', 'pro', 'team');
  END IF;

  RETURN COALESCE(active_plan, 'free');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 6. FUNCTION: get_subscription_details
-- =========================================================================
-- Returns full subscription info for the web settings page.

CREATE OR REPLACE FUNCTION public.get_subscription_details(p_user_id UUID)
RETURNS TABLE (
  plan TEXT,
  platform TEXT,
  status TEXT,
  current_period_end TIMESTAMPTZ,
  can_manage_here BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.plan,
    s.platform,
    s.status,
    s.current_period_end,
    (s.platform = 'web') AS can_manage_here
  FROM public.subscriptions s
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trial', 'cancelled')
    AND s.current_period_end > NOW()
  ORDER BY
    CASE s.plan WHEN 'team' THEN 1 WHEN 'pro' THEN 2 ELSE 3 END
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
