-- ==========================================================================
-- Sythio — Features V4: Highlights, Comments, Workspaces, Channels, API Keys
-- Idempotent — safe to re-run.
-- ==========================================================================

BEGIN;

-- =========================================================================
-- 0. ENSURE set_updated_at() function exists
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- =========================================================================
-- 1. HIGHLIGHTS column on notes (JSONB array of segment indexes)
-- =========================================================================
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS highlights JSONB NOT NULL DEFAULT '[]'::jsonb;

-- =========================================================================
-- 2. COMMENTS table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.comments (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  note_id     UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  segment_index INT,  -- optional: links comment to a specific transcript segment
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_comments_note
  ON public.comments(note_id, created_at DESC);

ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comments' AND policyname='Users read comments on own notes') THEN
    CREATE POLICY "Users read comments on own notes" ON public.comments FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.notes WHERE notes.id = note_id AND notes.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comments' AND policyname='Users insert comments on own notes') THEN
    CREATE POLICY "Users insert comments on own notes" ON public.comments FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.notes WHERE notes.id = note_id AND notes.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comments' AND policyname='Users update own comments') THEN
    CREATE POLICY "Users update own comments" ON public.comments FOR UPDATE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='comments' AND policyname='Users delete own comments') THEN
    CREATE POLICY "Users delete own comments" ON public.comments FOR DELETE TO authenticated
      USING (auth.uid() = user_id);
  END IF;
END $$;

-- =========================================================================
-- 3. WORKSPACES table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.workspaces (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  owner_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  avatar_url  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workspaces_owner
  ON public.workspaces(owner_id);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 4. WORKSPACE_MEMBERS table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.workspace_members (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  joined_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace
  ON public.workspace_members(workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
  ON public.workspace_members(user_id);

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

-- Workspace policies: members can see their workspaces
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workspaces' AND policyname='Members read workspace') THEN
    CREATE POLICY "Members read workspace" ON public.workspaces FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_members.workspace_id = id AND workspace_members.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workspaces' AND policyname='Owner manages workspace') THEN
    CREATE POLICY "Owner manages workspace" ON public.workspaces FOR ALL TO authenticated
      USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workspace_members' AND policyname='Members read membership') THEN
    CREATE POLICY "Members read membership" ON public.workspace_members FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = workspace_id AND wm.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='workspace_members' AND policyname='Admins manage members') THEN
    CREATE POLICY "Admins manage members" ON public.workspace_members FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));
  END IF;
END $$;

-- =========================================================================
-- 5. CHANNELS table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.channels (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  is_public     BOOLEAN NOT NULL DEFAULT true,
  created_by    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace
  ON public.channels(workspace_id);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channels' AND policyname='Workspace members read channels') THEN
    CREATE POLICY "Workspace members read channels" ON public.channels FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_members.workspace_id = channels.workspace_id AND workspace_members.user_id = auth.uid()));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channels' AND policyname='Admins manage channels') THEN
    CREATE POLICY "Admins manage channels" ON public.channels FOR ALL TO authenticated
      USING (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = channels.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')))
      WITH CHECK (EXISTS (SELECT 1 FROM public.workspace_members wm WHERE wm.workspace_id = channels.workspace_id AND wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));
  END IF;
END $$;

-- =========================================================================
-- 6. CHANNEL_NOTES (many-to-many: notes shared to channels)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.channel_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id  UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  note_id     UUID NOT NULL REFERENCES public.notes(id) ON DELETE CASCADE,
  shared_by   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  shared_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (channel_id, note_id)
);

CREATE INDEX IF NOT EXISTS idx_channel_notes_channel
  ON public.channel_notes(channel_id, shared_at DESC);

CREATE INDEX IF NOT EXISTS idx_channel_notes_note
  ON public.channel_notes(note_id);

ALTER TABLE public.channel_notes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channel_notes' AND policyname='Workspace members read channel notes') THEN
    CREATE POLICY "Workspace members read channel notes" ON public.channel_notes FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.channels c
        JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
        WHERE c.id = channel_id AND wm.user_id = auth.uid()
      ));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='channel_notes' AND policyname='Members share notes to channels') THEN
    CREATE POLICY "Members share notes to channels" ON public.channel_notes FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = shared_by AND EXISTS (
        SELECT 1 FROM public.channels c
        JOIN public.workspace_members wm ON wm.workspace_id = c.workspace_id
        WHERE c.id = channel_id AND wm.user_id = auth.uid()
      ));
  END IF;
END $$;

-- =========================================================================
-- 7. API_KEYS table (for public API access)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key_hash    TEXT NOT NULL,  -- SHA-256 hash of the API key
  name        TEXT NOT NULL DEFAULT 'Default',
  permissions JSONB NOT NULL DEFAULT '["read"]'::jsonb,
  last_used   TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user
  ON public.api_keys(user_id);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash
  ON public.api_keys(key_hash);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='api_keys' AND policyname='Users manage own api keys') THEN
    CREATE POLICY "Users manage own api keys" ON public.api_keys FOR ALL TO authenticated
      USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- =========================================================================
-- 8. WORKSPACE_ID on notes (optional — link note to workspace)
-- =========================================================================
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_notes_workspace
  ON public.notes(workspace_id) WHERE workspace_id IS NOT NULL;

-- =========================================================================
-- 9. Updated_at triggers for new tables
-- =========================================================================
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_comments_updated_at') THEN
    CREATE TRIGGER trg_comments_updated_at
      BEFORE UPDATE ON public.comments
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_workspaces_updated_at') THEN
    CREATE TRIGGER trg_workspaces_updated_at
      BEFORE UPDATE ON public.workspaces
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_channels_updated_at') THEN
    CREATE TRIGGER trg_channels_updated_at
      BEFORE UPDATE ON public.channels
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

COMMIT;
