-- Helper functions for enterprise onboarding.
-- Use these from Supabase Dashboard → SQL Editor with a single query.
-- All functions require the caller to be service_role (postgres user / Dashboard SQL editor).

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- onboard_enterprise_company — One-shot onboarding.
--
-- Creates a workspace, sets all users to 'enterprise' plan, adds them as members.
-- Users MUST already be registered in Supabase Auth (Authentication → Users).
-- The first email in `user_emails` becomes the owner; the rest become members.
-- (Optionally pass `admin_emails` for admins.)
--
-- Example usage:
--   SELECT public.onboard_enterprise_company(
--     'Acme Corp',
--     ARRAY['ceo@acme.com', 'dev1@acme.com', 'dev2@acme.com'],
--     ARRAY['cto@acme.com']     -- optional admins
--   );
--
-- Returns JSON with workspace_id and counts.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.onboard_enterprise_company(
  p_company_name TEXT,
  p_user_emails TEXT[],
  p_admin_emails TEXT[] DEFAULT ARRAY[]::TEXT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_workspace_id UUID;
  v_owner_id UUID;
  v_owner_email TEXT;
  v_user_id UUID;
  v_email TEXT;
  v_missing TEXT[] := ARRAY[]::TEXT[];
  v_added_count INT := 0;
  v_admin_set TEXT[] := ARRAY(SELECT lower(unnest) FROM unnest(p_admin_emails));
  v_role TEXT;
BEGIN
  IF p_company_name IS NULL OR length(trim(p_company_name)) < 2 THEN
    RAISE EXCEPTION 'company_name required';
  END IF;
  IF array_length(p_user_emails, 1) IS NULL OR array_length(p_user_emails, 1) < 1 THEN
    RAISE EXCEPTION 'at least one user email required';
  END IF;

  v_owner_email := lower(p_user_emails[1]);

  -- Resolve owner first (must exist).
  SELECT id INTO v_owner_id FROM auth.users WHERE lower(email) = v_owner_email;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'owner email % is not registered in auth.users — invite the user first via Dashboard → Authentication → Users → Add user', v_owner_email;
  END IF;

  -- Create the workspace.
  INSERT INTO public.workspaces (name, owner_id, plan)
  VALUES (p_company_name, v_owner_id, 'enterprise')
  RETURNING id INTO v_workspace_id;

  -- Owner: set plan + add as workspace owner
  UPDATE public.profiles SET plan = 'enterprise' WHERE id = v_owner_id;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_owner_id, 'owner')
  ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner';
  v_added_count := v_added_count + 1;

  -- Process the rest
  FOREACH v_email IN ARRAY p_user_emails[2:array_length(p_user_emails, 1)]
  LOOP
    v_email := lower(trim(v_email));
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email;

    IF v_user_id IS NULL THEN
      v_missing := array_append(v_missing, v_email);
      CONTINUE;
    END IF;

    -- Role: admin if email is in admin list, else member
    v_role := CASE WHEN v_email = ANY(v_admin_set) THEN 'admin' ELSE 'member' END;

    UPDATE public.profiles SET plan = 'enterprise' WHERE id = v_user_id;
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (v_workspace_id, v_user_id, v_role)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = v_role;

    v_added_count := v_added_count + 1;
  END LOOP;

  -- Auto-mark matching inquiry as converted (if any inquiry exists for the owner email).
  UPDATE public.enterprise_inquiries
  SET status = 'converted',
      contacted_at = COALESCE(contacted_at, NOW()),
      notes = COALESCE(notes, '') || E'\nOnboarded ' || v_added_count || ' users on ' || NOW()::DATE || ' as workspace ' || v_workspace_id
  WHERE lower(email) = v_owner_email
    AND status IN ('new', 'contacted', 'qualified');

  RETURN jsonb_build_object(
    'workspace_id', v_workspace_id,
    'company', p_company_name,
    'added_users', v_added_count,
    'missing_emails', v_missing,
    'note', CASE
      WHEN array_length(v_missing, 1) > 0
        THEN 'Some emails were not registered yet. Invite them via Dashboard → Authentication → Users, then call public.add_users_to_workspace().'
      ELSE 'All users onboarded.'
    END
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- add_users_to_workspace — Add more users to an existing enterprise workspace.
--
-- Example:
--   SELECT public.add_users_to_workspace(
--     'workspace-uuid-here',
--     ARRAY['new1@acme.com', 'new2@acme.com'],
--     'member'      -- or 'admin' or 'owner'
--   );
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.add_users_to_workspace(
  p_workspace_id UUID,
  p_user_emails TEXT[],
  p_role TEXT DEFAULT 'member'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT;
  v_added INT := 0;
  v_missing TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'role must be owner|admin|member';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = p_workspace_id) THEN
    RAISE EXCEPTION 'workspace % does not exist', p_workspace_id;
  END IF;

  FOREACH v_email IN ARRAY p_user_emails
  LOOP
    v_email := lower(trim(v_email));
    SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email;
    IF v_user_id IS NULL THEN
      v_missing := array_append(v_missing, v_email);
      CONTINUE;
    END IF;

    UPDATE public.profiles SET plan = 'enterprise' WHERE id = v_user_id AND plan <> 'enterprise';
    INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (p_workspace_id, v_user_id, p_role)
    ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = p_role;
    v_added := v_added + 1;
  END LOOP;

  RETURN jsonb_build_object('added', v_added, 'missing_emails', v_missing);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- offboard_enterprise_user — Remove a user from a workspace + downgrade them.
-- Pass `keep_premium := true` to leave them on Premium instead of Free.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.offboard_enterprise_user(
  p_workspace_id UUID,
  p_user_email TEXT,
  p_keep_premium BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_email TEXT := lower(trim(p_user_email));
  v_new_plan TEXT := CASE WHEN p_keep_premium THEN 'premium' ELSE 'free' END;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email;
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'user % not found', v_email;
  END IF;

  DELETE FROM public.workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = v_user_id;

  -- Only downgrade if they aren't a member of any other enterprise workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
    JOIN public.workspaces w ON w.id = wm.workspace_id
    WHERE wm.user_id = v_user_id AND w.plan = 'enterprise'
  ) THEN
    UPDATE public.profiles SET plan = v_new_plan WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object('user_id', v_user_id, 'new_plan', v_new_plan);
END;
$$;

-- Lock down — these are admin-only (called from Dashboard SQL Editor with service role).
REVOKE EXECUTE ON FUNCTION public.onboard_enterprise_company(TEXT, TEXT[], TEXT[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.onboard_enterprise_company(TEXT, TEXT[], TEXT[]) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.onboard_enterprise_company(TEXT, TEXT[], TEXT[]) FROM anon;

REVOKE EXECUTE ON FUNCTION public.add_users_to_workspace(UUID, TEXT[], TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_users_to_workspace(UUID, TEXT[], TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_users_to_workspace(UUID, TEXT[], TEXT) FROM anon;

REVOKE EXECUTE ON FUNCTION public.offboard_enterprise_user(UUID, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.offboard_enterprise_user(UUID, TEXT, BOOLEAN) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.offboard_enterprise_user(UUID, TEXT, BOOLEAN) FROM anon;

COMMIT;
