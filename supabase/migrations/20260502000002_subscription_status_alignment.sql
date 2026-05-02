-- Align get_subscription_details with sync_profile_plan / get_user_effective_plan.
--
-- Drift found:
--   - get_subscription_details accepts: active, trial, cancelled
--   - sync_profile_plan / get_user_effective_plan accept: active, trial, past_due
--
-- User-visible bug: a user in Stripe Smart Retries (status=past_due) has the
-- right plan in profiles.plan (via trigger) but the Settings page (via this
-- RPC) shows nothing during the grace period — UI doesn't match permissions.
--
-- Also: plan ordering still references legacy tier names (team, pro). Current
-- tiers are enterprise / premium / pro_plus / free. Update the rank so the
-- "best" subscription is picked correctly when a user has more than one row.

BEGIN;

-- Drop first because we're adding the STABLE qualifier (Postgres rejects it on REPLACE).
DROP FUNCTION IF EXISTS public.get_subscription_details(UUID);

CREATE FUNCTION public.get_subscription_details(p_user_id UUID)
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
    AND s.status IN ('active', 'trial', 'past_due', 'cancelled')
    AND s.current_period_end > NOW()
  ORDER BY
    CASE s.plan
      WHEN 'enterprise' THEN 1
      WHEN 'pro_plus'   THEN 2
      WHEN 'premium'    THEN 3
      ELSE 4
    END
  LIMIT 1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 'cancelled' is intentionally allowed here (UI shows "ends on X") but excluded
-- from sync_profile_plan because once Stripe sends status=cancelled the period
-- has typically already ended. RevenueCat is different: it sends CANCELLATION
-- when the user presses cancel, while the period is still active. The
-- current_period_end > NOW() check covers both cases for the read path.

COMMIT;
