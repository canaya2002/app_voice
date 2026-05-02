// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// IP rate limit — prevents brute-forcing share tokens.
// Distributed via DB so cold starts and edge region rotation don't reset state.
const IP_RATE_LIMIT = 30;          // requests per hour per IP
const IP_RATE_WINDOW_SECONDS = 3600;
const ENDPOINT_NAME = "get-shared-note";

async function checkIpRateLimit(
  admin: ReturnType<typeof createClient>,
  ip: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  try {
    const { data, error } = await admin.rpc("check_ip_rate_limit", {
      p_ip: ip,
      p_endpoint: ENDPOINT_NAME,
      p_max_count: IP_RATE_LIMIT,
      p_window_seconds: IP_RATE_WINDOW_SECONDS,
    });
    if (error || !data || data.length === 0) {
      return { allowed: true, retryAfter: 0 };
    }
    const row = data[0] as { allowed: boolean; retry_after: number };
    return { allowed: row.allowed, retryAfter: row.retry_after ?? 0 };
  } catch {
    return { allowed: true, retryAfter: 0 };
  }
}

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const ok = !origin
    || origin === "https://sythio.app"
    || origin === "https://www.sythio.app"
    || origin.endsWith(".sythio.vercel.app")
    || origin.startsWith("http://localhost")
    || origin.startsWith("exp://");
  return {
    "Access-Control-Allow-Origin": ok ? (origin || "https://sythio.app") : "https://sythio.app",
    "Vary": "Origin",
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

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // IP rate limit (anti brute-force on share tokens)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  const ipCheck = await checkIpRateLimit(admin, clientIp);
  if (!ipCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "rate_limit_exceeded", retry_after: ipCheck.retryAfter }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(ipCheck.retryAfter) } },
    );
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
