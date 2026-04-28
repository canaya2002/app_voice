// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// IP rate limit — prevents brute-forcing share tokens
const IP_RATE_LIMIT = 30;          // requests per hour per IP
const IP_RATE_WINDOW_MS = 3_600_000;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now >= entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + IP_RATE_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  entry.count++;
  if (entry.count > IP_RATE_LIMIT) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfter: 0 };
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of ipHits) if (now >= entry.resetAt) ipHits.delete(ip);
}, 5 * 60_000);

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

  // IP rate limit (anti brute-force on share tokens)
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip") || "unknown";
  const ipCheck = checkIpRateLimit(clientIp);
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
