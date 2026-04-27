-- ==========================================================================
-- 2026-04-07: Fix folders table, missing indexes, broken FK constraints,
--             and update delete_user()
-- ==========================================================================


-- ── 1. Create folders table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.folders (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_user ON public.folders(user_id, created_at);
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'folders' AND policyname = 'Users manage own folders') THEN
    CREATE POLICY "Users manage own folders" ON public.folders
      FOR ALL TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Add folder_id FK on notes if missing
DO $$ BEGIN
  ALTER TABLE public.notes
    ADD CONSTRAINT notes_folder_id_fkey
    FOREIGN KEY (folder_id) REFERENCES public.folders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_column THEN NULL;
END $$;


-- ── 2. Add missing index on comments(user_id) ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_comments_user ON public.comments(user_id);


-- ── 3. Fix org_invitations.invited_by: NO ACTION → SET NULL ───────────
-- Without this fix, delete_user() FAILS if user ever invited someone.
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT tc.constraint_name INTO cname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'org_invitations'
    AND kcu.column_name = 'invited_by'
    AND tc.constraint_type = 'FOREIGN KEY';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.org_invitations DROP CONSTRAINT %I', cname);
    ALTER TABLE public.org_invitations
      ADD CONSTRAINT org_invitations_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    RAISE NOTICE 'Fixed org_invitations.invited_by → SET NULL';
  END IF;
END $$;


-- ── 4. Fix organization_members.invited_by: NO ACTION → SET NULL ──────
DO $$
DECLARE
  cname TEXT;
BEGIN
  SELECT tc.constraint_name INTO cname
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
  WHERE tc.table_name = 'organization_members'
    AND kcu.column_name = 'invited_by'
    AND tc.constraint_type = 'FOREIGN KEY';

  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.organization_members DROP CONSTRAINT %I', cname);
    ALTER TABLE public.organization_members
      ADD CONSTRAINT organization_members_invited_by_fkey
      FOREIGN KEY (invited_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
    RAISE NOTICE 'Fixed organization_members.invited_by → SET NULL';
  END IF;
END $$;


-- ── 5. Add CASCADE FK on platform_sessions if missing ─────────────────
DO $$ BEGIN
  ALTER TABLE public.platform_sessions
    ADD CONSTRAINT platform_sessions_user_fkey
    FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
          WHEN undefined_table THEN NULL;
END $$;


-- ── 6. Update delete_user() — handles all edge cases ──────────────────
CREATE OR REPLACE FUNCTION public.delete_user()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Pre-clean SET NULL tables (cascade won't auto-nullify, it will SET NULL
  -- on delete, but let's be explicit for safety)
  UPDATE public.analytics_events SET user_id = NULL WHERE user_id = uid;

  -- Delete from auth.users triggers CASCADE through profiles:
  --
  -- CASCADE deletes:
  --   profiles → notes → mode_results, comments, api_keys, integrations,
  --              subscriptions, platform_sessions, folders,
  --              workspaces → channels → channel_notes,
  --              workspace_members, sythio_admins,
  --              organization_members (user_id)
  --
  -- SET NULL (preserves record, removes reference):
  --   organizations.owner_id, org_invitations.invited_by,
  --   organization_members.invited_by, workspace_members.invited_by,
  --   analytics_events.user_id
  --
  DELETE FROM auth.users WHERE id = uid;
END;
$$;
