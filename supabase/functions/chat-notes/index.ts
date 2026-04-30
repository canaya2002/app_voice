// deno-lint-ignore-file
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const MAX_CONTEXT_CHARS = 12000;
const MAX_NOTES_CONTEXT = 5;

// ── Rate limits (must match _shared/pricing.ts dailyChatLimit) ────────────
const DAILY_CHAT_LIMITS: Record<string, number> = {
  free: 0,                              // free users gated entirely
  premium: 100,
  pro_plus: 500,
  enterprise: Number.POSITIVE_INFINITY,
};
const IP_RATE_LIMIT = 30;               // questions per hour per IP
const IP_RATE_WINDOW_MS = 3_600_000;

// In-memory IP rate limiter (resets on cold start — acceptable for chat).
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
  for (const [ip, entry] of ipHits) {
    if (now >= entry.resetAt) ipHits.delete(ip);
  }
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
    "Access-Control-Allow-Origin": ok ? (origin || "https://sythio.app") : "https://sythio.app",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
}

serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── IP rate limit (layer 1) ──
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("cf-connecting-ip")
    || "unknown";
  const ipCheck = checkIpRateLimit(clientIp);
  if (!ipCheck.allowed) {
    return new Response(
      JSON.stringify({ error: "rate_limit_exceeded", message: "Demasiadas preguntas. Espera un momento.", retry_after: ipCheck.retryAfter }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(ipCheck.retryAfter) } },
    );
  }

  // ── Auth ──
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Sesión inválida" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: "Body inválido" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const question = body.question as string | undefined;
  if (!question || typeof question !== "string" || question.length > 500) {
    return new Response(JSON.stringify({ error: "Pregunta inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── Context selection params ──
  const contextType = (body.context_type as string) || "all";          // "all" | "notes" | "folder" | "channel"
  const noteIds = Array.isArray(body.note_ids) ? body.note_ids as string[] : [];
  const folderIds = Array.isArray(body.folder_ids) ? body.folder_ids as string[] : [];
  const channelIds = Array.isArray(body.channel_ids) ? body.channel_ids as string[] : [];

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Plan gate + daily chat limit (atomic increment via RPC — race-safe) ──
  const { data: profile } = await admin
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();
  const plan = (profile?.plan as string) || "free";
  const dailyChatMax = DAILY_CHAT_LIMITS[plan] ?? DAILY_CHAT_LIMITS.free;

  if (dailyChatMax === 0) {
    return new Response(
      JSON.stringify({ error: "gate_exceeded", gate: "requires_premium", message: "El chat con IA requiere Premium o superior." }),
      { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // For finite caps, attempt atomic increment. RPC returns true if under limit (and increments),
  // false if at/over limit. Enterprise (Infinity) skips the check entirely.
  if (Number.isFinite(dailyChatMax)) {
    // Pass a sentinel max_count high enough that JSON-safe (32-bit int).
    const { data: incremented } = await admin.rpc("increment_chat_count", {
      user_id_input: user.id,
      max_count: dailyChatMax,
    });
    if (!incremented) {
      return new Response(
        JSON.stringify({
          error: "rate_limit_exceeded",
          limit_type: "daily",
          message: `Has alcanzado el límite de ${dailyChatMax} preguntas diarias.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
  }

  // ── Fetch notes based on context type ──
  let notes: Record<string, unknown>[] = [];
  const selectFields = "id, title, summary, transcript, key_points, tasks, clean_text, created_at, primary_mode, template, speakers_detected, folder_id";

  if (contextType === "notes" && noteIds.length > 0) {
    // Explicit note selection
    const { data } = await admin
      .from("notes")
      .select(selectFields)
      .eq("user_id", user.id)
      .eq("status", "done")
      .in("id", noteIds.slice(0, 20))
      .order("created_at", { ascending: false });
    notes = (data ?? []) as Record<string, unknown>[];

  } else if (contextType === "folder" && folderIds.length > 0) {
    // Notes from specific folders
    const { data } = await admin
      .from("notes")
      .select(selectFields)
      .eq("user_id", user.id)
      .eq("status", "done")
      .in("folder_id", folderIds.slice(0, 10))
      .order("created_at", { ascending: false })
      .limit(30);
    notes = (data ?? []) as Record<string, unknown>[];

  } else if (contextType === "channel" && channelIds.length > 0) {
    // Notes shared to specific channels
    const { data: channelNoteRows } = await admin
      .from("channel_notes")
      .select("note_id")
      .in("channel_id", channelIds.slice(0, 10));

    const cnNoteIds = (channelNoteRows ?? []).map((r: Record<string, unknown>) => r.note_id as string);
    if (cnNoteIds.length > 0) {
      const { data } = await admin
        .from("notes")
        .select(selectFields)
        .in("id", cnNoteIds.slice(0, 30))
        .eq("status", "done")
        .order("created_at", { ascending: false });
      notes = (data ?? []) as Record<string, unknown>[];
    }

  } else {
    // Default: all user's recent notes (original behavior)
    const { data } = await admin
      .from("notes")
      .select(selectFields)
      .eq("user_id", user.id)
      .eq("status", "done")
      .order("created_at", { ascending: false })
      .limit(20);
    notes = (data ?? []) as Record<string, unknown>[];
  }

  if (!notes || notes.length === 0) {
    return new Response(
      JSON.stringify({ answer: "No encontré notas en el contexto seleccionado. Intenta con otra selección o graba tu primer audio.", sources: [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // ── Relevance scoring ──
  const queryWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const scored = notes.map((note) => {
    const haystack = [
      note.title, note.summary, note.transcript,
      ...(Array.isArray(note.key_points) ? note.key_points : []),
      ...(Array.isArray(note.tasks) ? note.tasks : []),
    ].join(" ").toLowerCase();

    let score = 0;
    for (const w of queryWords) {
      if (haystack.includes(w)) score++;
    }
    // Recency boost
    const daysAgo = (Date.now() - new Date(note.created_at as string).getTime()) / 86400000;
    if (daysAgo < 1) score += 2;
    else if (daysAgo < 7) score += 1;

    // If user explicitly selected context, boost all selected notes
    if (contextType !== "all") score += 3;

    return { note, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const relevant = scored.slice(0, MAX_NOTES_CONTEXT).filter(s => s.score > 0);

  // If no relevant notes found, use the most recent ones
  const contextNotes = relevant.length > 0
    ? relevant.map(r => r.note)
    : notes.slice(0, 3);

  // ── Build context from notes ──
  let contextChars = 0;
  const contextBlocks: string[] = [];
  const sourceIds: string[] = [];

  for (const note of contextNotes) {
    const block = `[Nota: "${note.title}" | ${note.created_at}]
Resumen: ${note.summary || "Sin resumen"}
Puntos clave: ${Array.isArray(note.key_points) ? note.key_points.join("; ") : ""}
Tareas: ${Array.isArray(note.tasks) ? note.tasks.join("; ") : ""}
Transcripción: ${((note.transcript as string) || "").slice(0, 2000)}`;

    if (contextChars + block.length > MAX_CONTEXT_CHARS) break;
    contextBlocks.push(block);
    sourceIds.push(note.id as string);
    contextChars += block.length;
  }

  // ── Build context description for the system prompt ──
  let contextDesc = "all of the user's notes";
  if (contextType === "notes") contextDesc = `${sourceIds.length} specifically selected notes`;
  else if (contextType === "folder") contextDesc = `notes from ${folderIds.length} selected folder(s)`;
  else if (contextType === "channel") contextDesc = `notes from ${channelIds.length} selected channel(s)`;

  // ── Call Claude ──
  const systemPrompt = `You are Sythio AI, a helpful assistant that answers questions about the user's voice notes and recordings.
You have access to ${contextDesc} provided below. Answer based ONLY on the information in these notes.
If the answer isn't in the notes, say so honestly.
Respond in the SAME LANGUAGE as the user's question.
Be concise and direct. Reference specific notes when possible.`;

  const userPrompt = `My notes:\n\n${contextBlocks.join("\n\n---\n\n")}\n\nQuestion: ${question}`;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 30000);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: ctrl.signal,
    });

    clearTimeout(timer);

    if (!res.ok) throw new Error("LLM error");
    const data = await res.json();
    const answer = data.content[0].text;

    // Note: daily_chat_count was already incremented atomically via increment_chat_count RPC above.
    // We optimistically increment BEFORE the LLM call so concurrent requests can't bypass the cap;
    // the trade-off is that a failed LLM call still consumes one of the user's daily quota.

    return new Response(
      JSON.stringify({ answer, sources: sourceIds }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch {
    return new Response(
      JSON.stringify({ error: "No pude procesar tu pregunta. Intenta de nuevo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
