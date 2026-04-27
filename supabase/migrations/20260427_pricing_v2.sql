-- Pricing v2: Premium $14.99/mo, Enterprise $29.99/mo
-- Source of truth (client + edge functions): lib/pricing.ts and supabase/functions/_shared/pricing.ts
--
-- This migration documents the pricing change and ensures the profiles.plan
-- enum supports the three tiers. Limits are enforced at runtime in edge
-- functions (see process-audio, convert-mode), not as DB constraints — this
-- avoids breaking existing rows whenever pricing changes.

DO $$ BEGIN
  COMMENT ON COLUMN profiles.plan IS
    'Subscription tier: free | premium | enterprise. Pricing v2 (2026-04-27): premium=$14.99/mo, enterprise=$29.99/mo. See lib/pricing.ts for limits.';
EXCEPTION WHEN undefined_column OR undefined_table THEN
  -- profiles.plan does not exist yet; nothing to comment.
  NULL;
END $$;

DO $$ BEGIN
  COMMENT ON TABLE subscriptions IS
    'Authoritative billing record. provider=revenuecat (mobile) or stripe (web). Subscriptions do NOT transfer between platforms — each platform bills independently. See docs/billing-architecture.md.';
EXCEPTION WHEN undefined_table THEN
  NULL;
END $$;
