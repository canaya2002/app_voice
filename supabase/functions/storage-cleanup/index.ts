// deno-lint-ignore-file
// Storage cleanup — deletes audio files from storage for notes that have been
// in the trash for >= 7 days. Run daily via pg_cron.
//
// Auth: Bearer <CLEANUP_SECRET> in Authorization header. The secret is a random
// token shared with the cron job. Service role key is not used here so that
// even if someone leaks the cron command, they can't impersonate users.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLEANUP_SECRET = Deno.env.get("STORAGE_CLEANUP_SECRET") ?? "";

const TRASH_DAYS = 7;
const BATCH_SIZE = 100;   // files per storage.remove() call

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { "Content-Type": "application/json" },
    });
  }

  // Auth check — Bearer with shared secret
  const auth = req.headers.get("Authorization") ?? "";
  if (!CLEANUP_SECRET || auth !== `Bearer ${CLEANUP_SECRET}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // Fetch all trashed notes >= 7 days with a non-empty audio_url.
    const cutoff = new Date(Date.now() - TRASH_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: notes, error: fetchErr } = await admin
      .from("notes")
      .select("id, audio_url")
      .not("deleted_at", "is", null)
      .lt("deleted_at", cutoff)
      .not("audio_url", "is", null)
      .neq("audio_url", "")
      .limit(5000); // safety cap

    if (fetchErr) {
      console.error("[storage-cleanup] fetch error:", fetchErr);
      return new Response(JSON.stringify({ error: "fetch_failed", detail: fetchErr.message }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }

    const targets = (notes ?? []).filter((n: any) => typeof n.audio_url === "string" && n.audio_url.length > 0);
    if (targets.length === 0) {
      return new Response(JSON.stringify({ ok: true, deleted: 0 }), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    }

    // Delete from storage in batches
    let totalDeleted = 0;
    const deletedNoteIds: string[] = [];
    for (let i = 0; i < targets.length; i += BATCH_SIZE) {
      const batch = targets.slice(i, i + BATCH_SIZE);
      const paths = batch.map((n: any) => n.audio_url as string);
      const { data: removed, error: rmErr } = await admin.storage.from("audio-files").remove(paths);
      if (rmErr) {
        console.error("[storage-cleanup] remove error:", rmErr.message);
        // Continue — we still want to clear audio_url on the rows even if some
        // storage objects don't exist (already deleted manually, etc.)
      }
      totalDeleted += removed?.length ?? 0;
      deletedNoteIds.push(...batch.map((n: any) => n.id as string));
    }

    // Clear audio_url on the rows we processed (so we don't try to re-delete next run).
    if (deletedNoteIds.length > 0) {
      await admin.from("notes").update({ audio_url: "" }).in("id", deletedNoteIds);
    }

    return new Response(
      JSON.stringify({ ok: true, deleted: totalDeleted, processed_notes: deletedNoteIds.length }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[storage-cleanup] unhandled:", err);
    return new Response(JSON.stringify({ error: "internal" }), {
      status: 500, headers: { "Content-Type": "application/json" },
    });
  }
});
