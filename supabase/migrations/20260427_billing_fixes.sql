-- Billing fixes — production hardening for Stripe + RevenueCat coexistence.
--
-- Issues addressed:
-- 1. stripe-webhook sets status='past_due' on invoice.payment_failed, but the
--    existing CHECK constraint rejects it → 500s and Stripe retries forever.
-- 2. trg_single_active_sub prevents a user from having BOTH a Stripe (web) and
--    a RevenueCat (iOS/Android) active sub at the same time, but
--    docs/billing-architecture.md explicitly allows this scenario.
-- 3. sync_profile_plan ignores 'past_due' rows, which would downgrade users
--    during Stripe Smart Retries grace period — RevenueCat / Stripe expect
--    the user to retain access while billing retries.

-- ── 1. Allow 'past_due' status ────────────────────────────────────────
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'cancelled', 'expired', 'trial', 'past_due'));

-- ── 2. Scope single-active-sub by provider ────────────────────────────
-- A user can have one active sub per provider (Stripe web + RevenueCat
-- mobile = OK), but not two from the same provider.
CREATE OR REPLACE FUNCTION public.check_single_active_subscription()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('active', 'trial', 'past_due') THEN
    IF EXISTS (
      SELECT 1 FROM public.subscriptions
      WHERE user_id = NEW.user_id
        AND id != NEW.id
        AND provider = NEW.provider
        AND status IN ('active', 'trial', 'past_due')
        AND current_period_end > NOW()
    ) THEN
      RAISE EXCEPTION 'User already has an active subscription with provider %. Cancel the existing one first.', NEW.provider;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ── 3. sync_profile_plan should treat past_due as active (grace period) ──
CREATE OR REPLACE FUNCTION public.sync_profile_plan()
RETURNS TRIGGER AS $$
DECLARE
  best_plan TEXT;
BEGIN
  SELECT plan INTO best_plan
  FROM public.subscriptions
  WHERE user_id = COALESCE(NEW.user_id, OLD.user_id)
    AND status IN ('active', 'trial', 'past_due')
    AND current_period_end > NOW()
  ORDER BY CASE plan WHEN 'enterprise' THEN 1 WHEN 'premium' THEN 2 ELSE 3 END
  LIMIT 1;

  UPDATE public.profiles
  SET plan = COALESCE(best_plan, 'free')
  WHERE id = COALESCE(NEW.user_id, OLD.user_id);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4. get_user_effective_plan should also count past_due ─────────────
CREATE OR REPLACE FUNCTION public.get_user_effective_plan(p_user_id UUID)
RETURNS TEXT AS $$
DECLARE
  active_plan TEXT;
BEGIN
  SELECT plan INTO active_plan
  FROM public.subscriptions
  WHERE user_id = p_user_id
    AND status IN ('active', 'trial', 'past_due')
    AND current_period_end > NOW()
  ORDER BY CASE plan WHEN 'enterprise' THEN 1 WHEN 'premium' THEN 2 ELSE 3 END
  LIMIT 1;

  RETURN COALESCE(active_plan, 'free');
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;
