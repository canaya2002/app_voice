-- ============================================================================
-- Migration: Global Action Items + Chat Context Selection
-- ============================================================================

-- ── 1. Action Items table ──────────────────────────────────────────────────
-- Consolidated tasks extracted from notes, with global CRUD + assignment

CREATE TABLE IF NOT EXISTS action_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_id     uuid REFERENCES notes(id) ON DELETE SET NULL,
  text        text NOT NULL,
  priority    text NOT NULL DEFAULT 'medium' CHECK (priority IN ('high', 'medium', 'low')),
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  assignee    text,                  -- free-text name (can be speaker name or external)
  due_date    date,                  -- optional deadline
  source_quote text,                 -- quote from transcript that originated this task
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Indexes for common queries
CREATE INDEX idx_action_items_user_status ON action_items(user_id, status);
CREATE INDEX idx_action_items_user_created ON action_items(user_id, created_at DESC);
CREATE INDEX idx_action_items_note ON action_items(note_id) WHERE note_id IS NOT NULL;

-- RLS
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own action items"
  ON action_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_action_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.completed_at = now();
  END IF;
  IF NEW.status != 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_action_items_updated_at
  BEFORE UPDATE ON action_items
  FOR EACH ROW
  EXECUTE FUNCTION update_action_items_updated_at();

-- ── 2. Chat context saved selections (optional, for UX persistence) ───────
-- Not a table — context selection is ephemeral and sent per request.
-- The chat-notes edge function will accept explicit context params.
