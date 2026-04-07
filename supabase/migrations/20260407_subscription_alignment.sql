-- ==========================================================================
-- 2026-04-07: Full subscription system — creates everything from scratch
--
-- Plans:  free ($0) | premium ($15/mo) | enterprise (custom)
-- Rules:  ONE active sub per user, auto-sync to profiles.plan
-- ==========================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
-- PART A: Create tables that may not exist yet
-- ═══════════════════════════════════════════════════════════════════════

-- ── A1. Subscriptions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform                 TEXT NOT NULL CHECK (platform IN ('ios', 'web', 'android')),
  status                   TEXT NOT NULL DEFAULT 'active'
                             CHECK (status IN ('active', 'cancelled', 'expired', 'trial')),
  plan                     TEXT NOT NULL DEFAULT 'premium'
                             CHECK (plan IN ('premium', 'enterprise')),
  product_id               TEXT,
  platform_subscription_id TEXT,
  current_period_start     TIMESTAMPTZ,
  current_period_end       TIMESTAMPTZ,
  price_cents              INT,
  currency                 TEXT DEFAULT 'usd',
  payment_link             TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status, current_period_end);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own subscriptions" ON public.subscriptions;
CREATE POLICY "Users can read own subscriptions"
  ON public.subscriptions FOR SELECT
  USING (auth.uid() = user_id);


-- ── A2. Platform sessions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_sessions (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL CHECK (platform IN ('ios', 'web', 'android')),
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  device_info JSONB DEFAULT '{}'::jsonb,
  UNIQUE(user_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_platform_sessions_user ON public.platform_sessions(user_id);

ALTER TABLE public.platform_sessions ENABLE ROW LEVEL SECURITY;

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


-- ── A3. Profiles columns ───────────────────────────────────────────────
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_expires_at TIMESTAMPTZ;


-- ═══════════════════════════════════════════════════════════════════════
-- PART B: Align plan names across the system
-- ═══════════════════════════════════════════════════════════════════════

-- Fix profiles.plan constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;
UPDATE public.profiles SET plan = 'premium' WHERE plan = 'pro';
UPDATE public.profiles SET plan = 'enterprise' WHERE plan = 'team';
ALTER TABLE public.profiles ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'premium', 'enterprise'));

-- Fix subscriptions.plan constraint (if old data exists)
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
UPDATE public.subscriptions SET plan = 'premium' WHERE plan = 'pro';
UPDATE public.subscriptions SET plan = 'enterprise' WHERE plan = 'team';
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('premium', 'enterprise'));

-- Add price columns if missing (idempotent)
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS price_cents INT;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'usd';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS payment_link TEXT;

-- Default premium price
UPDATE public.subscriptions SET price_cents = 1500, currency = 'usd'
  WHERE plan = 'premium' AND price_cents IS NULL;


-- ═══════════════════════════════════════════════════════════════════════
-- PART C: Enterprise tables
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.enterprise_orgs (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT NOT NULL,
  owner_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  base_price_cents INT NOT NULL DEFAULT 1500,
  currency         TEXT NOT NULL DEFAULT 'usd',
  payment_link     TEXT,
  max_seats        INT DEFAULT 50,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enterprise_orgs_owner ON public.enterprise_orgs(owner_id);
ALTER TABLE public.enterprise_orgs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org owners manage" ON public.enterprise_orgs;
CREATE POLICY "Org owners manage" ON public.enterprise_orgs
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);


CREATE TABLE IF NOT EXISTS public.enterprise_members (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id    UUID NOT NULL REFERENCES public.enterprise_orgs(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role      TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_enterprise_members_org ON public.enterprise_members(org_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_members_user ON public.enterprise_members(user_id);
ALTER TABLE public.enterprise_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members see org members" ON public.enterprise_members;
CREATE POLICY "Members see org members" ON public.enterprise_members
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enterprise_members my
    WHERE my.org_id = enterprise_members.org_id AND my.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admins manage members" ON public.enterprise_members;
CREATE POLICY "Admins manage members" ON public.enterprise_members
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enterprise_members my
    WHERE my.org_id = enterprise_members.org_id AND my.user_id = auth.uid() AND my.role IN ('owner', 'admin')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.enterprise_members my
    WHERE my.org_id = enterprise_members.org_id AND my.user_id = auth.uid() AND my.role IN ('owner', 'admin')
  ));

-- Members can also read their org
DROP POLICY IF EXISTS "Members read org" ON public.enterprise_orgs;
CREATE POLICY "Members read org" ON public.enterprise_orgs
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.enterprise_members em
    WHERE em.org_id = enterprise_orgs.id AND em.user_id = auth.uid()
  ));


-- ═══════════════════════════════════════════════════════════════════════
-- PART D: Functions & Triggers
-- ═══════════════════════════════════════════════════════════════════════

-- ── D1. Auto-update enterprise price on member change ──────────────────
CREATE OR REPLACE FUNCTION public.update_enterprise_price()
RETURNS TRIGGER AS $$
DECLARE
  v_member_count INT;
BEGIN
  SELECT COUNT(*) INTO v_member_count
  FROM public.enterprise_members
  WHERE org_id = COALESCE(NEW.org_id, OLD.org_id);

  UPDATE public.subscriptions s
  SET price_cents = (
        SELECT eo.base_price_cents * v_member_count
        FROM public.enterprise_orgs eo
        WHERE eo.id = COALESCE(NEW.org_id, OLD.org_id)
      ),
      updated_at = NOW()
  WHERE s.user_id IN (
    SELECT em.user_id FROM public.enterprise_members em
    WHERE em.org_id = COALESCE(NEW.org_id, OLD.org_id)
  )
  AND s.plan = 'enterprise'
  AND s.status IN ('active', 'trial');

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enterprise_price_update ON public.enterprise_members;
CREATE TRIGGER trg_enterprise_price_update
  AFTER INSERT OR DELETE ON public.enterprise_members
  FOR EACH ROW EXECUTE FUNCTION public.update_enterprise_price();


-- ── D2. Prevent duplicate active subscriptions ─────────────────────────
CREATE OR REPLACE FUNCTION public.check_single_active_subscription()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('active', 'trial') THEN
    IF EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = NEW.user_id
        AND id != NEW.id
        AND status IN ('active', 'trial')
        AND current_period_end > NOW()
    ) THEN
      RAISE EXCEPTION 'User already has an active subscription. Cancel the existing one first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_single_active_sub ON public.subscriptions;
CREATE TRIGGER trg_single_active_sub
  BEFORE INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.check_single_active_subscription();


-- ── D3. Sync profiles.plan when subscription changes ───────────────────
CREATE OR REPLACE FUNCTION public.sync_profile_plan()
RETURNS TRIGGER AS $$
DECLARE
  best_plan TEXT;
BEGIN
  SELECT plan INTO best_plan
  FROM public.subscriptions
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    AND status IN ('active', 'trial')
    AND current_period_end > NOW()
  ORDER BY CASE plan WHEN 'enterprise' THEN 1 WHEN 'premium' THEN 2 ELSE 3 END
  LIMIT 1;

  UPDATE public.profiles
  SET plan = COALESCE(best_plan, 'free')
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_profile_plan ON public.subscriptions;
CREATE TRIGGER trg_sync_profile_plan
  AFTER INSERT OR UPDATE OR DELETE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_plan();


-- ── D4. get_user_effective_plan ────────────────────────────────────────
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
  ORDER BY CASE plan WHEN 'enterprise' THEN 1 WHEN 'premium' THEN 2 ELSE 3 END
  LIMIT 1;

  IF active_plan IS NULL THEN
    SELECT plan INTO active_plan
    FROM public.profiles
    WHERE id = p_user_id AND plan IN ('premium', 'enterprise');
  END IF;

  RETURN COALESCE(active_plan, 'free');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── D5. get_subscription_details ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_subscription_details(p_user_id UUID)
RETURNS TABLE (
  plan TEXT, platform TEXT, status TEXT, current_period_end TIMESTAMPTZ,
  can_manage_here BOOLEAN, price_cents INT,
  enterprise_org_name TEXT, enterprise_member_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.plan, s.platform, s.status, s.current_period_end,
    (s.platform = 'web') AS can_manage_here,
    s.price_cents,
    eo.name,
    (SELECT COUNT(*)::INT FROM public.enterprise_members em2 WHERE em2.org_id = eo.id)
  FROM public.subscriptions s
  LEFT JOIN public.enterprise_members em ON em.user_id = s.user_id
  LEFT JOIN public.enterprise_orgs eo ON eo.id = em.org_id AND s.plan = 'enterprise'
  WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trial', 'cancelled')
    AND s.current_period_end > NOW()
  ORDER BY CASE s.plan WHEN 'enterprise' THEN 1 WHEN 'premium' THEN 2 ELSE 3 END
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMIT;
