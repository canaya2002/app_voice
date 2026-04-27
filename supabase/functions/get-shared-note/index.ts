// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const ok = !origin
    || origin === "https://sythio.app"
    || origin === "https://www.sythio.app"
    || origin.endsWith(".sythio.vercel.app")
    || origin.startsWith("http://localhost")
    || origin.startsWith("exp://");
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "*") : "https://sythio.app",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const token = body.token as string | undefined;
  if (!token || typeof token !== "string" || token.length < 10 || token.length > 50) {
    return new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Fetch note by share token
  const { data: note, error } = await admin
    .from("notes")
    .select("id, title, summary, transcript, key_points, tasks, clean_text, audio_duration, speakers_detected, is_conversation, segments, speakers, primary_mode, template, status, created_at")
    .eq("share_token", token)
    .is("deleted_at", null)
    .eq("status", "done")
    .single();

  if (error || !note) {
    return new Response(JSON.stringify({ error: "Nota no encontrada o link expirado" }), {
      status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch mode results for this note
  const { data: modeResults } = await admin
    .from("mode_results")
    .select("id, mode, result, created_at")
    .eq("note_id", note.id)
    .order("created_at");

  return new Response(
    JSON.stringify({ note, mode_results: modeResults ?? [] }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
