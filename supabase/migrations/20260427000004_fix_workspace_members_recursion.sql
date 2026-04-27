-- Fix infinite recursion in workspace_members RLS policies.
--
-- The original policies in 20260401000000_features_v4.sql query
-- workspace_members from inside a workspace_members policy, which Postgres
-- detects as recursive and rejects with 500.
--
-- New approach:
--   - SELECT: a user can read their own membership rows directly (no subquery
--     needed). To see other members of the same workspace, the client should
--     filter by workspace_id; the workspaces RLS already restricts which
--     workspaces are visible.
--   - ALL (insert/update/delete): scoped to rows where the actor is the
--     workspace owner — this avoids querying workspace_members from inside its
--     own policy. We check the workspaces table instead, which is non-recursive.

DROP POLICY IF EXISTS "Members read membership" ON public.workspace_members;
DROP POLICY IF EXISTS "Admins manage members" ON public.workspace_members;

-- A user can read their own membership rows.
CREATE POLICY "Read own membership" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- A user can also read membership rows for workspaces they are a member of.
-- We use a SECURITY DEFINER helper to bypass RLS and avoid recursion.
CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = p_user_id
  );
$$;

-- Grant execute so the policy can call it as the authenticated user.
GRANT EXECUTE ON FUNCTION public.is_workspace_member(UUID, UUID) TO authenticated;

-- Members can see all members of their workspaces (uses helper, no recursion).
CREATE POLICY "Read workspace members" ON public.workspace_members
  FOR SELECT TO authenticated
  USING (public.is_workspace_member(workspace_id, auth.uid()));

-- Workspace owner can manage members (insert/update/delete). Checks the
-- workspaces table directly — non-recursive.
CREATE POLICY "Owner manages members" ON public.workspace_members
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      WHERE w.id = workspace_id AND w.owner_id = auth.uid()
    )
  );

-- A user can also insert their OWN membership row (e.g., when accepting an
-- invitation). The application layer should validate the invitation token
-- before letting them call this.
CREATE POLICY "Insert own membership" ON public.workspace_members
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
