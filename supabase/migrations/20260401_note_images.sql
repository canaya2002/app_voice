-- ==========================================================================
-- Sythio — Note images support
-- ==========================================================================

BEGIN;

-- Add images column to notes (array of storage paths)
ALTER TABLE public.notes ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Storage bucket for note images (create via dashboard if SQL doesn't work)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('note-images', 'note-images', true, 10485760)  -- 10MB limit, public for display
ON CONFLICT (id) DO NOTHING;

-- Storage policies for note-images bucket
-- Users can upload to their own folder
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Users upload note images') THEN
    CREATE POLICY "Users upload note images" ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

-- Anyone can read (images are public for shared notes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Public read note images') THEN
    CREATE POLICY "Public read note images" ON storage.objects FOR SELECT TO public
      USING (bucket_id = 'note-images');
  END IF;
END $$;

-- Users can delete their own images
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='objects' AND policyname='Users delete own note images') THEN
    CREATE POLICY "Users delete own note images" ON storage.objects FOR DELETE TO authenticated
      USING (bucket_id = 'note-images' AND (storage.foldername(name))[1] = auth.uid()::text);
  END IF;
END $$;

COMMIT;
