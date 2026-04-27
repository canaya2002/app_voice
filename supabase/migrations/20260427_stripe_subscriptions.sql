-- Stripe subscription support — adds Stripe-specific columns + provider discriminator.
--
-- Decision: a single `subscriptions` table holds both RevenueCat (mobile) and
-- Stripe (web) records, distinguished by `provider`. Each user can have AT
-- MOST ONE active subscription per provider — they can technically have one
-- on iOS and one on web at the same time, but the UI never lets them upgrade
-- on web while paying on iOS (and vice versa).
--
-- See docs/billing-architecture.md for the full reasoning.

ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'revenuecat';

-- Constraint: provider must be one of the supported values.
DO $$ BEGIN
  ALTER TABLE subscriptions
    ADD CONSTRAINT subscriptions_provider_check
    CHECK (provider IN ('revenuecat', 'stripe'));
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Stripe subscription IDs are globally unique, so enforce uniqueness when present.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_key
  ON subscriptions(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- Lookup index for webhook handlers that match by customer ID.
CREATE INDEX IF NOT EXISTS subscriptions_stripe_customer_idx
  ON subscriptions(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

COMMENT ON COLUMN subscriptions.provider IS
  'Billing provider: revenuecat (iOS/Android) or stripe (web). Subscriptions DO NOT transfer between providers.';
