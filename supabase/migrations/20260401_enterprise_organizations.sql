-- ═══════════════════════════════════════════════════════════════════════════
-- Enterprise Organizations — tables, RLS, triggers, indexes
-- ═══════════════════════════════════════════════════════════════════════════

-- ORGANIZACIONES
CREATE TABLE IF NOT EXISTS organizations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  domain text UNIQUE,
  owner_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  plan text DEFAULT 'enterprise',

  -- Pricing custom por organización
  billing_type text DEFAULT 'per_seat',  -- 'per_seat' | 'flat'
  price_per_seat numeric(10,2),
  flat_price numeric(10,2),
  billing_cycle text DEFAULT 'monthly',  -- 'monthly' | 'annual'

  -- Stripe
  stripe_customer_id text,
  stripe_subscription_id text,
  stripe_price_id text,

  -- Configuración
  max_seats int DEFAULT 10,
  seats_used int DEFAULT 0,
  active bool DEFAULT true,

  -- Límites custom (null = sin límite)
  custom_audio_minutes_per_day int,
  custom_notes_per_day int,

  -- Metadata
  notes text,
  contract_start date,
  contract_end date,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- MIEMBROS DE ORGANIZACIÓN
CREATE TABLE IF NOT EXISTS organization_members (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text DEFAULT 'member',    -- 'owner' | 'admin' | 'member'
  status text DEFAULT 'active',  -- 'active' | 'suspended' | 'pending'
  invited_by uuid REFERENCES profiles(id),
  invited_at timestamptz DEFAULT now(),
  joined_at timestamptz,
  UNIQUE(org_id, user_id)
);

-- INVITACIONES PENDIENTES
CREATE TABLE IF NOT EXISTS org_invitations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text DEFAULT 'member',
  token text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  invited_by uuid REFERENCES profiles(id),
  expires_at timestamptz DEFAULT now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- HISTORIAL DE BILLING
CREATE TABLE IF NOT EXISTS billing_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  seats_billed int NOT NULL,
  amount_charged numeric(10,2) NOT NULL,
  currency text DEFAULT 'usd',
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  status text DEFAULT 'pending',  -- 'pending' | 'paid' | 'failed' | 'refunded'
  notes text,
  created_at timestamptz DEFAULT now()
);

-- ADMINS DE SYTHIO (para el admin dashboard)
CREATE TABLE IF NOT EXISTS sythio_admins (
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE PRIMARY KEY,
  role text DEFAULT 'admin',  -- 'super_admin' | 'admin' | 'support'
  created_at timestamptz DEFAULT now()
);

-- Agregar org_id y plan a profiles si no existen
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES organizations(id);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS plan text DEFAULT 'free';

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view their org" ON organizations
  FOR SELECT USING (
    id IN (SELECT org_id FROM organization_members WHERE user_id = auth.uid())
    OR owner_id = auth.uid()
  );

ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members can view org members" ON organization_members
  FOR SELECT USING (
    org_id IN (SELECT om.org_id FROM organization_members om WHERE om.user_id = auth.uid())
  );

ALTER TABLE billing_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins can view billing" ON billing_history
  FOR SELECT USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org admins can manage invitations" ON org_invitations
  FOR ALL USING (
    org_id IN (
      SELECT om.org_id FROM organization_members om
      WHERE om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

ALTER TABLE sythio_admins ENABLE ROW LEVEL SECURITY;
-- No public policies — only service_role can access

-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_org_members_user ON organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_org_members_org ON organization_members(org_id);
CREATE INDEX IF NOT EXISTS idx_billing_org ON billing_history(org_id, period_start DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_org ON profiles(org_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNCIÓN: calcular seats usados automáticamente
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_org_seats()
RETURNS trigger AS $$
BEGIN
  UPDATE organizations SET
    seats_used = (
      SELECT COUNT(*) FROM organization_members
      WHERE org_id = COALESCE(NEW.org_id, OLD.org_id)
      AND status = 'active'
    ),
    updated_at = now()
  WHERE id = COALESCE(NEW.org_id, OLD.org_id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_update_org_seats ON organization_members;
CREATE TRIGGER trigger_update_org_seats
  AFTER INSERT OR UPDATE OR DELETE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION update_org_seats();
