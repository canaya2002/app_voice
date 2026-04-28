-- Tier restructure (2026-04-28):
--   free       = $0
--   premium    = $14.99 (was: same)
--   pro_plus   = $29.99 (RENAMED FROM 'enterprise' — same price, same features as old enterprise)
--   enterprise = custom B2B (NEW — solicitable from web only, manual provisioning, 5+ users)
--
-- Changes:
-- 1. Update profiles.plan CHECK constraint to allow 'pro_plus'.
-- 2. Migrate any existing 'enterprise' rows to 'pro_plus' (since the meaning shifted).
-- 3. Update subscriptions.plan CHECK constraint similarly.
-- 4. Create enterprise_inquiries table (form submissions from website).

BEGIN;

-- ── 1. profiles.plan constraint ──────────────────────────────────────────────
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_plan_check;

-- Migrate existing 'enterprise' users to 'pro_plus' (the renamed tier).
-- Anyone genuinely on the new B2B 'enterprise' tier will be set manually after this migration.
UPDATE public.profiles SET plan = 'pro_plus' WHERE plan = 'enterprise';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'premium', 'pro_plus', 'enterprise'));

COMMENT ON COLUMN public.profiles.plan IS
  'Subscription tier: free | premium ($14.99) | pro_plus ($29.99) | enterprise (custom B2B). See lib/pricing.ts for limits.';

-- ── 2. subscriptions.plan constraint ────────────────────────────────────────
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;

UPDATE public.subscriptions SET plan = 'pro_plus' WHERE plan = 'enterprise';

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check
  CHECK (plan IN ('premium', 'pro_plus', 'enterprise'));

-- ── 3. enterprise_inquiries: B2B contact form submissions ───────────────────
CREATE TABLE IF NOT EXISTS public.enterprise_inquiries (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL,
  company       TEXT NOT NULL,
  role          TEXT,
  num_users     INT,
  message       TEXT,
  source        TEXT DEFAULT 'web',     -- 'web' | 'manual' | 'referral'
  status        TEXT NOT NULL DEFAULT 'new'
                  CHECK (status IN ('new', 'contacted', 'qualified', 'converted', 'rejected')),
  ip_address    INET,                    -- for spam tracking
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  contacted_at  TIMESTAMPTZ,
  notes         TEXT
);

CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_status
  ON public.enterprise_inquiries(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_enterprise_inquiries_email
  ON public.enterprise_inquiries(email);

ALTER TABLE public.enterprise_inquiries ENABLE ROW LEVEL SECURITY;

-- Only the founder/admin can read inquiries — no client-side reads ever.
-- Inserts are done via service role from the edge function (bypasses RLS).
DROP POLICY IF EXISTS "No public reads" ON public.enterprise_inquiries;
-- (No SELECT policy = no one can read via PostgREST except service role)

COMMENT ON TABLE public.enterprise_inquiries IS
  'B2B contact form submissions from the website. Inserted by edge function enterprise-inquiry. Read only via Supabase Dashboard or service role.';

-- ── 4. Rate limiting helpers ────────────────────────────────────────────────
-- Track per-day chat-notes usage to enforce caps server-side.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS daily_chat_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS daily_convert_count INT NOT NULL DEFAULT 0;

COMMIT;
