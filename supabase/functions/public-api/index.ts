// deno-lint-ignore-file
/**
 * Sythio Public API
 *
 * Authentication: Bearer token using API key (generated from profile)
 * API keys are stored as SHA-256 hashes in the api_keys table.
 *
 * Endpoints (via ?action= query param):
 *   GET  ?action=list_notes       — List user's notes (paginated)
 *   GET  ?action=get_note&id=X    — Get a specific note with results
 *   GET  ?action=get_transcript&id=X — Get transcript + segments
 *   GET  ?action=list_modes&id=X  — List mode results for a note
 *   POST ?action=convert_mode     — Generate a new mode for a note
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...getCorsHeaders(), "Content-Type": "application/json" },
  });
}

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders() });

  // ── Auth: API Key ──
  const authHeader = req.headers.get("Authorization") ?? "";
  const apiKey = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!apiKey) return jsonResponse({ error: "API key required" }, 401);

  const keyHash = await hashKey(apiKey);
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: keyRecord } = await admin
    .from("api_keys")
    .select("id, user_id, permissions, revoked_at")
    .eq("key_hash", keyHash)
    .single();

  if (!keyRecord || keyRecord.revoked_at) {
    return jsonResponse({ error: "Invalid or revoked API key" }, 401);
  }

  const userId = keyRecord.user_id as string;
  const permissions = (keyRecord.permissions as string[]) || ["read"];

  // Update last_used
  await admin.from("api_keys").update({ last_used: new Date().toISOString() }).eq("id", keyRecord.id);

  // ── Route ──
  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  switch (action) {
    case "list_notes": {
      if (!permissions.includes("read")) return jsonResponse({ error: "Insufficient permissions" }, 403);

      const limit = Math.min(parseInt(url.searchParams.get("limit") || "20"), 100);
      const offset = parseInt(url.searchParams.get("offset") || "0");

      const { data, error, count } = await admin
        .from("notes")
        .select("id, title, status, audio_duration, speakers_detected, is_conversation, primary_mode, template, created_at, updated_at", { count: "exact" })
        .eq("user_id", userId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ notes: data, total: count, limit, offset });
    }

    case "get_note": {
      if (!permissions.includes("read")) return jsonResponse({ error: "Insufficient permissions" }, 403);

      const noteId = url.searchParams.get("id");
      if (!noteId) return jsonResponse({ error: "Note ID required" }, 400);

      const { data: note, error } = await admin
        .from("notes")
        .select("*")
        .eq("id", noteId)
        .eq("user_id", userId)
        .single();

      if (error || !note) return jsonResponse({ error: "Note not found" }, 404);

      const { data: results } = await admin
        .from("mode_results")
        .select("id, mode, result, tone, created_at")
        .eq("note_id", noteId)
        .order("created_at", { ascending: true });

      return jsonResponse({ note, mode_results: results ?? [] });
    }

    case "get_transcript": {
      if (!permissions.includes("read")) return jsonResponse({ error: "Insufficient permissions" }, 403);

      const noteId = url.searchParams.get("id");
      if (!noteId) return jsonResponse({ error: "Note ID required" }, 400);

      const { data: note, error } = await admin
        .from("notes")
        .select("id, title, transcript, segments, speakers, speakers_detected, is_conversation")
        .eq("id", noteId)
        .eq("user_id", userId)
        .single();

      if (error || !note) return jsonResponse({ error: "Note not found" }, 404);
      return jsonResponse(note);
    }

    case "list_modes": {
      if (!permissions.includes("read")) return jsonResponse({ error: "Insufficient permissions" }, 403);

      const noteId = url.searchParams.get("id");
      if (!noteId) return jsonResponse({ error: "Note ID required" }, 400);

      // Verify ownership
      const { data: noteCheck } = await admin
        .from("notes")
        .select("id")
        .eq("id", noteId)
        .eq("user_id", userId)
        .single();

      if (!noteCheck) return jsonResponse({ error: "Note not found" }, 404);

      const { data: results } = await admin
        .from("mode_results")
        .select("id, mode, result, tone, created_at")
        .eq("note_id", noteId)
        .order("created_at", { ascending: true });

      return jsonResponse({ mode_results: results ?? [] });
    }

    case "convert_mode": {
      if (req.method !== "POST") return jsonResponse({ error: "POST required" }, 405);
      if (!permissions.includes("write")) return jsonResponse({ error: "Insufficient permissions (needs 'write')" }, 403);

      let body: Record<string, unknown>;
      try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid body" }, 400); }

      const noteId = body.note_id as string;
      const targetMode = body.target_mode as string;
      if (!noteId || !targetMode) return jsonResponse({ error: "note_id and target_mode required" }, 400);

      // Verify ownership
      const { data: noteCheck } = await admin
        .from("notes")
        .select("id")
        .eq("id", noteId)
        .eq("user_id", userId)
        .single();

      if (!noteCheck) return jsonResponse({ error: "Note not found" }, 404);

      // Delegate to convert-mode function internally
      // For now, return info about how to trigger conversion
      return jsonResponse({
        message: "Use the Supabase convert-mode function directly for mode conversion.",
        note_id: noteId,
        target_mode: targetMode,
      });
    }

    default:
      return jsonResponse({
        error: "Unknown action",
        available_actions: ["list_notes", "get_note", "get_transcript", "list_modes", "convert_mode"],
      }, 400);
  }
});
